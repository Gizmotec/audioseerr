import { User } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AlbumCard } from "@/app/search/AlbumCard";
import { AmbientArtworkBackground } from "@/components/AmbientArtworkBackground";
import { BackLink } from "@/components/BackLink";
import { resolveAppleMusicUrl } from "@/lib/appleMusic";
import { getDeezerArtistBundle } from "@/lib/deezer";
import { getArtistInfo, getArtistTopTracks } from "@/lib/lastfm";
import { buildLibraryIndex } from "@/lib/library";
import { getLikedSet, isLiked } from "@/lib/likes";
import { getArtist, type MbReleaseGroupSummary } from "@/lib/musicbrainz";
import { prisma } from "@/lib/db";
import { getSettings, isSetupComplete } from "@/lib/settings";
import { ArtistDetail } from "./ArtistDetail";
import type { ExistingArtistRequestStatus } from "./RequestArtistButton";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ mbid: string }>;

// Section order on the page. Anything not listed falls into "Other".
const TYPE_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: "Album", label: "Albums" },
  { key: "EP", label: "EPs" },
  { key: "Single", label: "Singles" },
  { key: "Compilation", label: "Compilations" },
  { key: "Live", label: "Live" },
  { key: "Other", label: "Other releases" },
];

export default async function ArtistPage({ params }: { params: RouteParams }) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }
  const role = (session.user as { role?: string }).role;
  const isAdmin = role === "ADMIN";
  const viewer = { id: userId, role };

  const { mbid } = await params;
  const artist = await getArtist(mbid);
  if (!artist) notFound();

  const settings = await getSettings();
  const lastFmKey = settings.lastFmApiKey;

  // Pull discovery bits (image, previews, similar) and bio in parallel —
  // they're independent and any of them is allowed to fail without breaking
  // the page. The MB call already happened above.
  const [
    bundle,
    info,
    lfmTopTracks,
    library,
    existingRequest,
    artistLiked,
    likedAlbums,
    appleMusicUrl,
  ] = await Promise.all([
    getDeezerArtistBundle(artist.name).catch(() => null),
    lastFmKey
      ? getArtistInfo({ apiKey: lastFmKey }, artist.mbid, artist.name).catch(
          () => null,
        )
      : Promise.resolve(null),
    lastFmKey
      ? getArtistTopTracks(
          { apiKey: lastFmKey },
          artist.mbid,
          artist.name,
          50,
        ).catch(() => [])
      : Promise.resolve([]),
    buildLibraryIndex(viewer),
    prisma.request.findFirst({
      where: { requestedById: userId, mbid, type: "ARTIST" },
      orderBy: { requestedAt: "desc" },
      select: { status: true },
    }),
    isLiked(userId, "ARTIST", mbid),
    getLikedSet(
      userId,
      "ALBUM",
      artist.releaseGroups.map((rg) => rg.mbid),
    ),
    resolveAppleMusicUrl({ artistName: artist.name }),
  ]);

  // Last.fm and Deezer rarely return identical track titles — Last.fm tends
  // to fold "(feat. X)" into the title while Deezer adds trailing punctuation.
  // Normalize aggressively so e.g. "Escapism." matches "Escapism (feat. 070
  // Shake)". Tracks that don't match just render without listener counts.
  const lfmByNormalized = new Map<
    string,
    { listeners: number; playcount: number }
  >();
  for (const t of lfmTopTracks) {
    const key = normalizeTrackTitle(t.name);
    if (key && !lfmByNormalized.has(key)) {
      lfmByNormalized.set(key, { listeners: t.listeners, playcount: t.playcount });
    }
  }
  const enrichedTopTracks = (bundle?.topTracks ?? []).map((t) => {
    const stats = lfmByNormalized.get(normalizeTrackTitle(t.title));
    return {
      ...t,
      listeners: stats?.listeners ?? null,
      playcount: stats?.playcount ?? null,
    };
  });

  const existingStatus =
    (existingRequest?.status as ExistingArtistRequestStatus) ?? null;

  // Bucket release groups by primary type, treating compilations + live as
  // their own buckets even when MB lists them as secondary types.
  const buckets = new Map<string, MbReleaseGroupSummary[]>();
  for (const rg of artist.releaseGroups) {
    const key = bucketFor(rg);
    const arr = buckets.get(key) ?? [];
    arr.push(rg);
    buckets.set(key, arr);
  }
  const sections = TYPE_ORDER.map((t) => ({
    label: t.label,
    items: buckets.get(t.key) ?? [],
  })).filter((s) => s.items.length > 0);

  const inLibraryCount = artist.releaseGroups.filter(
    (rg) =>
      library.lookup({ mbid: rg.mbid, artistName: artist.name, title: rg.title })
        ?.status === "downloaded",
  ).length;

  const meta = [
    artist.country,
    formatLifeSpan(artist.lifeBegin, artist.lifeEnd, artist.ended),
    `${artist.releaseGroups.length} release${artist.releaseGroups.length === 1 ? "" : "s"}`,
    info?.listeners ? `${formatListenerCount(info.listeners)} listeners` : null,
    inLibraryCount > 0 ? `${inLibraryCount} in your library` : null,
  ]
    .filter((x): x is string => !!x)
    .join(" · ");

  const similar = bundle?.similar ?? [];

  return (
    <main className="relative isolate mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6">
      <AmbientArtworkBackground imageUrl={bundle?.imageUrl} />

      <BackLink fallbackHref="/home" />

      <div className="mt-6">
        <ArtistDetail
          artist={{
            mbid: artist.mbid,
            name: artist.name,
            type: artist.type,
            imageUrl: bundle?.imageUrl ?? null,
            meta,
            bio: info?.bio ?? null,
          }}
          topTracks={enrichedTopTracks}
          existingStatus={existingStatus}
          hasLastFmKey={!!lastFmKey}
          liked={artistLiked}
          appleMusicUrl={appleMusicUrl}
          canRemoveFromLibrary={isAdmin && inLibraryCount > 0}
        />
      </div>

      {sections.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          MusicBrainz doesn&apos;t have any releases for this artist yet.
        </p>
      ) : (
        <div className="mt-10 space-y-10">
          {sections.map((section) => (
            <section key={section.label} className="space-y-3">
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                {section.label}{" "}
                <span className="text-muted-foreground/60">({section.items.length})</span>
              </h2>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {section.items.map((rg) => (
                  <li key={rg.mbid}>
                    <AlbumCard
                      album={{
                        mbid: rg.mbid,
                        title: rg.title,
                        artistName: artist.name,
                        artistMbid: artist.mbid,
                        firstReleaseDate: rg.firstReleaseDate,
                        primaryType: rg.primaryType,
                        coverUrl: rg.coverUrl,
                      }}
                      libraryHit={library.lookup({
                        mbid: rg.mbid,
                        artistName: artist.name,
                        title: rg.title,
                      })}
                      liked={likedAlbums.has(rg.mbid)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {similar.length > 0 && (
        <section className="mt-12 space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Similar artists
          </h2>
          <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {similar.map((s) => (
              <li key={s.name}>
                {/* Deezer doesn't return MBIDs, so we can't deep-link to
                    /artist/[mbid]. A name search lands the user on the album
                    grid where they can click through to this artist's page. */}
                <Link
                  href={`/search?q=${encodeURIComponent(s.name)}`}
                  className="group flex flex-col items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="relative aspect-square w-full overflow-hidden rounded-full bg-secondary">
                    {s.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.imageUrl}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                        <User className="h-1/3 w-1/3" />
                      </div>
                    )}
                  </div>
                  <p
                    className="w-full truncate text-center text-xs"
                    title={s.name}
                  >
                    {s.name}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function bucketFor(rg: MbReleaseGroupSummary): string {
  // Live and Compilation are MB secondary types that override the album/EP
  // primary so the discography sections feel right.
  if (rg.secondaryTypes.includes("Compilation")) return "Compilation";
  if (rg.secondaryTypes.includes("Live")) return "Live";
  if (rg.primaryType === "Album") return "Album";
  if (rg.primaryType === "EP") return "EP";
  if (rg.primaryType === "Single") return "Single";
  return "Other";
}

function normalizeTrackTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(\s*(feat|ft|featuring|with)\.?\s+[^)]*\)/g, "")
    .replace(/\[\s*(feat|ft|featuring|with)\.?\s+[^\]]*\]/g, "")
    .replace(/\b(feat|ft|featuring)\.?\s+.+$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

function formatListenerCount(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return v >= 10 ? `${Math.round(v)}M` : `${v.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return v >= 10 ? `${Math.round(v)}K` : `${v.toFixed(1)}K`;
  }
  return n.toLocaleString();
}

function formatLifeSpan(
  begin: string | null,
  end: string | null,
  ended: boolean,
): string | null {
  if (!begin && !end) return null;
  const beginYear = begin?.slice(0, 4);
  const endYear = end?.slice(0, 4);
  if (beginYear && endYear) return `${beginYear}–${endYear}`;
  if (beginYear) return ended ? `${beginYear}–?` : `${beginYear}–present`;
  return endYear ? `–${endYear}` : null;
}
