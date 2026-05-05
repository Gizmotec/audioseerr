import {
  ArrowRight,
  CheckCircle2,
  Compass,
  Disc3,
  Library,
  ListMusic,
  Music2,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  LibraryAlbumTile,
  type LibraryTileItem,
} from "@/app/library/LibraryAlbumTile";
import { PlaylistTile } from "@/app/playlists/PlaylistTile";
import { SearchBar } from "@/app/search/SearchBar";
import { ShuffleLibraryButton } from "@/components/ShuffleLibraryButton";
import { prisma } from "@/lib/db";
import { getLikedSongsPlaylistSummary } from "@/lib/likes";
import { listPlaylists } from "@/lib/playlists";
import { isSetupComplete } from "@/lib/settings";

export const dynamic = "force-dynamic";

type ArtistSummary = {
  name: string;
  albumCount: number;
  downloadedCount: number;
  trackFileCount: number;
};

export default async function HomePage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }

  const [libraryRows, likedSongs, playlists] = await Promise.all([
    prisma.libraryItem.findMany({
      where: { status: "downloaded" },
      select: {
        mbid: true,
        status: true,
        artistName: true,
        title: true,
        trackFileCount: true,
        totalTrackCount: true,
        lastSyncedAt: true,
      },
      orderBy: [{ artistName: "asc" }, { title: "asc" }],
    }),
    getLikedSongsPlaylistSummary(userId),
    listPlaylists(userId),
  ]);

  const libraryItems: (LibraryTileItem & { lastSyncedAt: Date })[] =
    libraryRows.map((row) => ({
      mbid: row.mbid,
      title: row.title,
      artistName: row.artistName,
      status: row.status as LibraryTileItem["status"],
      trackFileCount: row.trackFileCount,
      totalTrackCount: row.totalTrackCount,
      lastSyncedAt: row.lastSyncedAt,
    }));

  const trackFileCount = libraryItems.reduce(
    (sum, item) => sum + item.trackFileCount,
    0,
  );

  const recentAlbums = [...libraryItems]
    .sort((a, b) => b.lastSyncedAt.getTime() - a.lastSyncedAt.getTime())
    .slice(0, 10);
  const allArtistSummaries = topArtists(libraryItems);
  const artistSummaries = allArtistSummaries.slice(0, 6);
  const artistCount = allArtistSummaries.length;
  const recentPlaylists = [likedSongs, ...playlists].slice(0, 5);
  const spotlight =
    recentAlbums.find((item) => item.status === "downloaded") ?? recentAlbums[0];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-5 border-b border-border pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <Library className="h-3.5 w-3.5" />
            Home
          </p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Your music, ready when you are.
          </h1>
          <p className="text-sm leading-6 text-muted-foreground md:text-base">
            A collection-first view of downloaded albums, playable tracks, and
            the playlists you keep coming back to.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ShuffleLibraryButton variant="secondary" />
          <Link
            href="/discover"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            <Compass className="h-4 w-4" />
            Discover
          </Link>
          <Link
            href="/library?status=downloaded"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Disc3 className="h-4 w-4" />
            Library
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Disc3}
          label="Downloaded albums"
          value={libraryItems.length.toLocaleString()}
          detail="Available on disk"
        />
        <Metric
          icon={Music2}
          label="Tracks on disk"
          value={trackFileCount.toLocaleString()}
          detail="Playable from downloaded albums"
        />
        <Metric
          icon={Library}
          label="Artists"
          value={artistCount.toLocaleString()}
          detail="From downloaded albums"
        />
        <Metric
          icon={ListMusic}
          label="Playlists"
          value={recentPlaylists.length.toLocaleString()}
          detail={`${likedSongs.trackCount.toLocaleString()} liked songs`}
        />
      </section>

      {libraryItems.length === 0 ? (
        <EmptyLibrary />
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
            <div className="rounded-md border border-border bg-secondary/15 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-medium">Ready to play</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Home only shows albums that have finished downloading.
                  </p>
                </div>
                <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <StatusPill
                  icon={Disc3}
                  label="Albums available"
                  value={libraryItems.length}
                />
                <StatusPill
                  icon={Music2}
                  label="Tracks available"
                  value={trackFileCount}
                />
                <StatusPill
                  icon={Library}
                  label="Artists represented"
                  value={artistCount}
                />
              </div>
            </div>

            <SpotlightAlbum album={spotlight} />
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Downloaded albums"
              href="/library?status=downloaded"
              action="Open library"
            />
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {recentAlbums.map((item) => (
                <li key={item.mbid}>
                  <LibraryAlbumTile item={item} />
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-3">
              <SectionHeader
                title="Playlists"
                href="/playlists"
                action="See all"
              />
              {recentPlaylists.length > 0 ? (
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {recentPlaylists.map((playlist) => (
                    <li key={playlist.id}>
                      <PlaylistTile playlist={playlist} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyPanel
                  icon={ListMusic}
                  title="No playlists yet"
                  body="Create one from albums you already have."
                  href="/playlists"
                  action="Create playlist"
                />
              )}
            </div>
            <div className="space-y-3">
              <SectionHeader
                title="Quick search"
                href="/discover"
                action="Full discover"
              />
              <div className="rounded-md border border-border bg-secondary/15 p-4">
                <SearchBar initialQuery="" />
              </div>
              <EmptyPanel
                icon={Compass}
                title="Looking for something new?"
                body="Discovery and requests live away from Home so this page stays focused on music you already have."
                href="/discover"
                action="Open discover"
              />
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader title="Top artists in your library" />
            <ol className="grid gap-2 md:grid-cols-2">
              {artistSummaries.map((artist, index) => (
                <li
                  key={artist.name}
                  className="grid min-h-16 grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md border border-border bg-secondary/15 px-3 py-3"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {artist.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {artist.downloadedCount} downloaded ·{" "}
                      {artist.trackFileCount} tracks
                    </span>
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {artist.albumCount}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-border bg-secondary/15 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function StatusPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{value.toLocaleString()}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  href,
  action,
}: {
  title: string;
  href?: string;
  action?: string;
}) {
  return (
    <header className="flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-medium">{title}</h2>
      {href && action && (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {action}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </header>
  );
}

function SpotlightAlbum({
  album,
}: {
  album: (LibraryTileItem & { lastSyncedAt: Date }) | undefined;
}) {
  if (!album) {
    return (
      <div className="rounded-md border border-border bg-secondary/15 p-5">
        <Disc3 className="mb-4 h-7 w-7 text-muted-foreground/60" />
        <h2 className="text-lg font-medium">No albums yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Discover and request something to start filling your library.
        </p>
      </div>
    );
  }

  return (
    <Link
      href={`/album/${album.mbid}`}
      className="group grid grid-cols-[6rem_1fr] gap-4 rounded-md border border-border bg-secondary/15 p-4 transition-colors hover:border-foreground/30 hover:bg-secondary/25"
    >
      <div className="aspect-square overflow-hidden rounded-md bg-secondary">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://coverartarchive.org/release-group/${album.mbid}/front-250`}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        />
      </div>
      <div className="min-w-0 self-center">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Latest in rotation
        </p>
        <h2 className="mt-2 truncate text-lg font-medium" title={album.title}>
          {album.title}
        </h2>
        <p className="truncate text-sm text-muted-foreground" title={album.artistName}>
          {album.artistName}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          {album.trackFileCount}/{album.totalTrackCount || album.trackFileCount} tracks
        </p>
      </div>
    </Link>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  body,
  href,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
      <Icon className="mb-3 h-6 w-6 text-muted-foreground/60" />
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1">{body}</p>
      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
      >
        {action}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function EmptyLibrary() {
  return (
    <section className="rounded-md border border-dashed border-border p-10 text-center">
      <Disc3 className="mx-auto mb-4 h-8 w-8 text-muted-foreground/60" />
      <h2 className="text-lg font-medium">No downloaded music yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        Requested and downloading albums stay out of Home until Lidarr has
        finished putting the files on disk.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link
          href="/discover"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Compass className="h-4 w-4" />
          Discover music
        </Link>
        <Link
          href="/library?status=downloaded"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          <Library className="h-4 w-4" />
          Open library
        </Link>
      </div>
    </section>
  );
}

function topArtists(
  items: (LibraryTileItem & { lastSyncedAt: Date })[],
): ArtistSummary[] {
  const artists = new Map<string, ArtistSummary>();
  for (const item of items) {
    const current =
      artists.get(item.artistName) ??
      ({
        name: item.artistName,
        albumCount: 0,
        downloadedCount: 0,
        trackFileCount: 0,
      } satisfies ArtistSummary);
    current.albumCount += 1;
    current.trackFileCount += item.trackFileCount;
    if (item.status === "downloaded") current.downloadedCount += 1;
    artists.set(item.artistName, current);
  }

  return Array.from(artists.values()).sort((a, b) => {
    if (b.albumCount !== a.albumCount) return b.albumCount - a.albumCount;
    if (b.trackFileCount !== a.trackFileCount) {
      return b.trackFileCount - a.trackFileCount;
    }
    return a.name.localeCompare(b.name);
  });
}
