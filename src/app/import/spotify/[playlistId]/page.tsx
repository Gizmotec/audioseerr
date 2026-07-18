import { AlertTriangle, ArrowLeft, CheckCircle2, Disc3, ExternalLink, XCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";
import { getSpotifyConnection } from "@/lib/spotify";
import {
  getPlaylist,
  getPlaylistTracks,
  type SpotifyPlaylistSummary,
} from "@/lib/spotify-api";
import { matchSpotifyTracks, type SpotifyTrackMatch } from "@/lib/spotify-match";
import { ImportButton } from "./ImportButton";

export const dynamic = "force-dynamic";
// MB matching for a 50-album playlist takes ~50s on a cold cache; bump the
// per-route timeout so Vercel doesn't kill the render.
export const maxDuration = 120;

type Params = Promise<{ playlistId: string }>;

export default async function SpotifyPlaylistPreview({
  params,
}: {
  params: Params;
}) {
  if (!(await isSetupComplete())) redirect("/setup");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const conn = await getSpotifyConnection(session.user.id);
  if (!conn) redirect("/admin/settings?section=integrations&reason=connect_spotify");

  const { playlistId } = await params;

  let playlist: SpotifyPlaylistSummary | null = null;
  let tracks: Awaited<ReturnType<typeof getPlaylistTracks>> = [];
  let fetchError: string | null = null;
  try {
    [playlist, tracks] = await Promise.all([
      getPlaylist(session.user.id, playlistId),
      getPlaylistTracks(session.user.id, playlistId),
    ]);
  } catch (e) {
    fetchError = e instanceof Error ? e.message : "Failed to fetch playlist.";
  }

  const [matchResult, snapshot] = await Promise.all([
    fetchError ? Promise.resolve(null) : matchSpotifyTracks(tracks),
    prisma.spotifyPlaylistImport.findUnique({
      where: { userId_playlistId: { userId: session.user.id, playlistId } },
    }),
  ]);

  const previousTrackIds = snapshot
    ? new Set<string>(JSON.parse(snapshot.trackIdsJson) as string[])
    : null;
  const newTrackCount = previousTrackIds
    ? tracks.filter((t) => !previousTrackIds.has(t.id)).length
    : 0;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/import/spotify"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to playlists
      </Link>

      <header className="mt-4 mb-8 flex items-start gap-4">
        <PlaylistCover url={playlist?.coverUrl ?? null} />
        <div className="min-w-0 flex-1">
          <h1
            className="truncate text-2xl font-semibold tracking-tight"
            title={playlist?.name ?? "Playlist"}
          >
            {playlist?.name ?? "Playlist"}
          </h1>
          {playlist && (
            <p className="text-sm text-muted-foreground">
              {playlist.trackCount} tracks · by {playlist.ownerName}
            </p>
          )}
          {playlist?.description && (
            <p
              className="mt-1 line-clamp-2 text-sm text-muted-foreground"
              title={playlist.description}
            >
              {playlist.description}
            </p>
          )}
        </div>
      </header>

      {snapshot && (
        <div className="mb-4 rounded-md border border-border bg-secondary/15 px-3 py-2 text-sm text-muted-foreground">
          Previously imported{" "}
          <RelativeTime date={snapshot.lastImportedAt} />.
          {!fetchError &&
            (newTrackCount > 0 ? (
              <span className="text-foreground">
                {" "}
                {newTrackCount} new {newTrackCount === 1 ? "track" : "tracks"}{" "}
                on the playlist since then.
              </span>
            ) : (
              <span> No new tracks since.</span>
            ))}
        </div>
      )}

      {fetchError && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">
              Couldn't load playlist
            </CardTitle>
            <CardDescription>{fetchError}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {matchResult && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryStat
              label="Will request"
              value={matchResult.matched.length}
              icon={<CheckCircle2 className="h-4 w-4 text-pastel-mint" />}
            />
            <SummaryStat
              label="No match"
              value={matchResult.notFound.length}
              icon={<XCircle className="h-4 w-4 text-muted-foreground" />}
            />
            <SummaryStat
              label="Albums looked up"
              value={matchResult.albumsLookedUp}
              icon={<Disc3 className="h-4 w-4 text-muted-foreground" />}
            />
          </div>

          <ImportButton
            playlistId={playlistId}
            matchedCount={matchResult.matched.length}
          />

          {matchResult && previousTrackIds && (
            <p className="mt-2 text-xs text-muted-foreground">
              {(() => {
                const newMatched = matchResult.matched.filter(
                  (m) => !previousTrackIds.has(m.spotifyTrack.id),
                ).length;
                if (newMatched === 0) {
                  return "All matchable tracks were imported the last time you ran this.";
                }
                return `${newMatched} of these are new since your last import.`;
              })()}
            </p>
          )}

          {matchResult.notFound.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">
                  Tracks we couldn't match
                </CardTitle>
                <CardDescription>
                  These albums weren't found in MusicBrainz. They'll be skipped
                  during import.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border text-sm">
                  {matchResult.notFound.map((m) => (
                    <li
                      key={m.spotifyTrack.id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate font-medium"
                          title={m.spotifyTrack.name}
                        >
                          {m.spotifyTrack.name}
                        </p>
                        <p
                          className="truncate text-xs text-muted-foreground"
                          title={`${m.spotifyTrack.primaryArtist} — ${m.spotifyTrack.album.name}`}
                        >
                          {m.spotifyTrack.primaryArtist} ·{" "}
                          {m.spotifyTrack.album.name}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {(() => {
            const uncertain = matchResult.matched.filter(
              (m) => m.confidence === "uncertain",
            );
            const confident = matchResult.matched.filter(
              (m) => m.confidence === "confident",
            );
            return (
              <>
                {uncertain.length > 0 && (
                  <Card className="mt-6 border-2 border-pastel-yellow">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <AlertTriangle className="h-4 w-4 text-pastel-yellow" />
                        Uncertain matches
                      </CardTitle>
                      <CardDescription>
                        These were matched on artist but the album title differs
                        from MusicBrainz — could be a different edition. Click
                        through to verify before importing.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <MatchList items={uncertain} />
                    </CardContent>
                  </Card>
                )}

                {confident.length > 0 && (
                  <Card className="mt-6">
                    <CardHeader>
                      <CardTitle className="text-base">
                        Confident matches
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <MatchList items={confident} />
                    </CardContent>
                  </Card>
                )}
              </>
            );
          })()}
        </>
      )}
    </main>
  );
}

function SummaryStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function RelativeTime({ date }: { date: Date }) {
  const ms = Date.now() - new Date(date).getTime();
  const minutes = Math.round(ms / 60000);
  const hours = Math.round(ms / 3_600_000);
  const days = Math.round(ms / 86_400_000);
  let text: string;
  if (minutes < 1) text = "just now";
  else if (minutes < 60) text = `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  else if (hours < 24) text = `${hours} hour${hours === 1 ? "" : "s"} ago`;
  else if (days < 30) text = `${days} day${days === 1 ? "" : "s"} ago`;
  else text = new Date(date).toLocaleDateString();
  return <time dateTime={new Date(date).toISOString()}>{text}</time>;
}

function MatchList({ items }: { items: SpotifyTrackMatch[] }) {
  return (
    <ul className="divide-y divide-border text-sm">
      {items.map((m) => (
        <li
          key={m.spotifyTrack.id}
          className="flex items-center justify-between gap-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium" title={m.spotifyTrack.name}>
              {m.spotifyTrack.name}
            </p>
            <p
              className="truncate text-xs text-muted-foreground"
              title={`${m.spotifyTrack.primaryArtist} — ${m.album.title}`}
            >
              {m.spotifyTrack.primaryArtist} · {m.album.title}
            </p>
          </div>
          <Link
            href={`/album/${m.album.mbid}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-input hover:text-foreground"
            title={m.reason}
          >
            View album <ExternalLink className="h-3 w-3" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PlaylistCover({ url }: { url: string | null }) {
  return (
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-secondary">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
          <Disc3 className="h-8 w-8" />
        </div>
      )}
    </div>
  );
}
