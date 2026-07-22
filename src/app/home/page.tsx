import {
  ArrowRight,
  Clock,
  Compass,
  Disc3,
  Flame,
  Library,
  ListMusic,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PlaylistTile } from "@/app/playlists/PlaylistTile";
import { SearchBar } from "@/app/search/SearchBar";
import {
  ContinuePlayingShelf,
  type ContinuePlayingItem,
} from "@/components/ContinuePlayingShelf";
import { OwnedTrackList, type OwnedTrack } from "@/components/OwnedTrackList";
import { ShuffleLibraryButton } from "@/components/ShuffleLibraryButton";
import { prisma } from "@/lib/db";
import { getLikedInboxSummary } from "@/lib/likes";
import {
  getMostPlayedTracks,
  getRecentlyPlayedTracks,
  type PlayedTrackItem,
} from "@/lib/playHistory";
import { getResumableTracks } from "@/lib/playPositions";
import { listPlaylists } from "@/lib/playlists";
import { isSetupComplete } from "@/lib/settings";
import { isAdmin } from "@/lib/userLibrary";

export const dynamic = "force-dynamic";

const streamUrl = (id: string) => `/api/stream/local/${id}`;

export default async function HomePage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }
  const role = (session.user as { role?: string }).role;
  const viewer = { id: userId, role };
  // Admins see every downloaded track; everyone else only what they own.
  // ephemeral: false keeps pre-downloaded discovery temp tracks off Home until
  // the user keeps them.
  const ownedWhere = {
    ephemeral: false,
    ...(isAdmin(viewer) ? {} : { users: { some: { userId } } }),
  };

  const [recentRows, likedSongs, playlists, recentlyPlayed, mostPlayed, artistGroups, resumable] =
    await Promise.all([
      prisma.downloadedTrack.findMany({
        where: ownedWhere,
        select: {
          id: true,
          title: true,
          artistName: true,
          albumTitle: true,
          albumMbid: true,
          coverUrl: true,
          durationMs: true,
          recordingMbid: true,
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      getLikedInboxSummary(userId),
      listPlaylists(userId),
      getRecentlyPlayedTracks(userId, 8, viewer),
      getMostPlayedTracks(userId, 8, viewer),
      prisma.downloadedTrack.groupBy({
        by: ["artistName"],
        where: ownedWhere,
        _count: { _all: true },
        orderBy: { _count: { artistName: "desc" } },
        take: 6,
      }),
      getResumableTracks(userId, 10, viewer),
    ]);

  const recentlyAdded: OwnedTrack[] = recentRows.map((t) => ({
    ...t,
    streamUrl: streamUrl(t.id),
  }));
  const continuePlaying: ContinuePlayingItem[] = resumable.map((t) => ({
    id: t.id,
    trackKey: t.trackKey,
    title: t.title,
    artistName: t.artistName,
    coverUrl: t.coverUrl,
    recordingMbid: t.recordingMbid,
    albumMbid: t.albumMbid,
    durationMs: t.durationMs,
    positionMs: t.positionMs,
    positionDurationMs: t.positionDurationMs,
    streamUrl: streamUrl(t.id),
  }));
  const isEmpty = recentlyAdded.length === 0;
  const recentPlaylists = [likedSongs, ...playlists].slice(0, 5);
  const topArtists = artistGroups.map((g) => ({
    name: g.artistName,
    trackCount: g._count._all,
  }));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-5 border-b border-foreground/10 pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <Library className="h-3.5 w-3.5" />
            Home
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            Your music, ready when you are.
          </h1>
          <p className="text-sm leading-6 text-muted-foreground md:text-base">
            The songs you&rsquo;ve downloaded, what you&rsquo;ve been playing,
            and the playlists you keep coming back to.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ShuffleLibraryButton variant="secondary" />
          <Link
            href="/discover"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-card px-4 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Compass className="h-4 w-4" />
            Discover
          </Link>
          <Link
            href="/library"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-pastel-pink/80"
          >
            <Disc3 className="h-4 w-4" />
            Library
          </Link>
        </div>
      </header>

      {isEmpty ? (
        <EmptyLibrary />
      ) : (
        <>
          <ContinuePlayingShelf items={continuePlaying} />

          <OwnedTrackList
            title="Recently added"
            tracks={recentlyAdded}
            icon={<Disc3 className="h-4 w-4 text-muted-foreground" />}
            seeAllHref="/library"
          />

          <OwnedTrackList
            title="Recently played"
            tracks={toOwned(recentlyPlayed, (t) => formatRelativeTime(t.lastPlayedAt))}
            icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          />

          <OwnedTrackList
            title="Most played"
            tracks={toOwned(
              mostPlayed,
              (t) => `${t.playCount} ${t.playCount === 1 ? "play" : "plays"}`,
            )}
            icon={<Flame className="h-4 w-4 text-muted-foreground" />}
          />

          <section className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-3">
              <SectionHeader title="Playlists" href="/playlists" action="See all" />
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
                  body="Build one from songs you already have."
                  href="/playlists"
                  action="Create playlist"
                />
              )}
            </div>
            <div className="space-y-3">
              <SectionHeader title="Quick search" href="/discover" action="Full discover" />
              <div className="rounded-2xl bg-card p-4">
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

          {topArtists.length > 0 && (
            <section className="space-y-3">
              <SectionHeader title="Top artists in your library" />
              <ol className="grid gap-2 md:grid-cols-2">
                {topArtists.map((artist, index) => (
                  <li
                    key={artist.name}
                    className="grid min-h-16 grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-xl bg-card px-3 py-3"
                  >
                    <span className="font-mono text-xs font-bold text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="block truncate text-sm font-bold">
                      {artist.name}
                    </span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold">
                      {artist.trackCount}{" "}
                      {artist.trackCount === 1 ? "track" : "tracks"}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function toOwned(
  tracks: PlayedTrackItem[],
  caption: (t: PlayedTrackItem) => string,
): OwnedTrack[] {
  return tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artistName: t.artistName,
    albumTitle: t.albumTitle,
    albumMbid: t.albumMbid,
    coverUrl: t.coverUrl,
    durationMs: t.durationMs,
    recordingMbid: t.recordingMbid,
    streamUrl: streamUrl(t.id),
    caption: caption(t),
  }));
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
      <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
      {href && action && (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          {action}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </header>
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
    <div className="rounded-2xl border-2 border-dashed border-foreground/15 bg-card p-6 text-sm text-muted-foreground">
      <Icon className="mb-3 h-6 w-6 text-muted-foreground/60" />
      <p className="font-extrabold tracking-tight text-foreground">{title}</p>
      <p className="mt-1">{body}</p>
      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-1 font-bold text-foreground underline-offset-4 hover:underline"
      >
        {action}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function EmptyLibrary() {
  return (
    <section className="rounded-2xl border-2 border-dashed border-foreground/15 bg-card p-10 text-center">
      <Disc3 className="mx-auto mb-4 h-8 w-8 text-muted-foreground/60" />
      <h2 className="text-lg font-extrabold tracking-tight">No downloaded music yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        Songs show up here once a request finishes downloading. Find something on
        Discover to get started.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link
          href="/discover"
          className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-pastel-pink/80"
        >
          <Compass className="h-4 w-4" />
          Discover music
        </Link>
        <Link
          href="/library"
          className="inline-flex h-9 items-center gap-2 rounded-full bg-card px-4 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Library className="h-4 w-4" />
          Open library
        </Link>
      </div>
    </section>
  );
}

// Compact "5m ago" / "2d ago" / "3w ago" formatter — keeps captions short
// without pulling in a date library. Falls back to a date past a year.
function formatRelativeTime(when: Date): string {
  const diffMs = Date.now() - when.getTime();
  if (diffMs < 60_000) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return when.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}
