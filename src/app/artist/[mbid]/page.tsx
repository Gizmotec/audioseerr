import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AlbumCard } from "@/app/search/AlbumCard";
import { buildLibraryIndex } from "@/lib/library";
import { getArtist, type MbReleaseGroupSummary } from "@/lib/musicbrainz";
import { isSetupComplete } from "@/lib/settings";

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
  if (!session?.user) {
    redirect("/login");
  }

  const { mbid } = await params;
  const artist = await getArtist(mbid);
  if (!artist) notFound();

  const library = await buildLibraryIndex();

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

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-8 flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {artist.type ?? "Artist"}
        </p>
        <h1 className="text-3xl font-semibold leading-tight md:text-5xl">
          {artist.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {[
            artist.country,
            formatLifeSpan(artist.lifeBegin, artist.lifeEnd, artist.ended),
            `${artist.releaseGroups.length} release${artist.releaseGroups.length === 1 ? "" : "s"}`,
            inLibraryCount > 0 ? `${inLibraryCount} in your library` : null,
          ]
            .filter((x): x is string => !!x)
            .join(" · ")}
        </p>
      </header>

      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          MusicBrainz doesn&apos;t have any releases for this artist yet.
        </p>
      ) : (
        <div className="space-y-10">
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
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
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
