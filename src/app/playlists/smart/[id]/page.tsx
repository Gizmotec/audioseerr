import { ListMusic, Sparkles } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackLink } from "@/components/BackLink";
import { HeroCard } from "@/components/HeroCard";
import { trackLikeTargetId } from "@/lib/likeKeys";
import type { MixTrack } from "@/lib/mixes";
import { isSetupComplete } from "@/lib/settings";
import { describeRule } from "@/lib/smartPlaylist";
import {
  getSmartPlaylist,
  getSmartPlaylistTracks,
} from "@/lib/smartPlaylists";
import { MixDetail } from "@/app/mix/[kind]/MixDetail";
import { SmartPlaylistActions } from "./SmartPlaylistActions";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ id: string }>;

/**
 * Smart playlist detail: the stored rule set is evaluated LIVE against the
 * viewer's library on every render (never a frozen track list). Tracks are
 * all library rows, so they render like a manual playlist via MixDetail
 * (full streams, likes, track menu).
 */
export default async function SmartPlaylistPage({
  params,
}: {
  params: RouteParams;
}) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }
  const role = (session.user as { role?: string }).role;

  const { id } = await params;
  const playlist = await getSmartPlaylist(userId, id);
  if (!playlist) notFound();

  const rows = await getSmartPlaylistTracks({ id: userId, role }, playlist);

  const tracks: MixTrack[] = rows.map((r) => ({
    kind: "library",
    title: r.title,
    artistName: r.artistName,
    albumTitle: r.albumTitle,
    coverUrl: r.coverUrl,
    durationMs: r.durationMs,
    downloadedTrackId: r.downloadedTrackId,
    recordingMbid: r.recordingMbid,
    albumMbid: r.albumMbid,
    albumPosition: r.albumPosition,
  }));
  const likedTrackIds = rows
    .filter((r) => r.liked)
    .map((r) => trackLikeTargetId(r.recordingMbid, r.albumMbid, r.albumPosition))
    .filter((x): x is string => !!x);

  return (
    <main className="relative isolate mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <BackLink fallbackHref="/playlists" />

      <HeroCard
        seed={playlist.name}
        className="mt-6"
        innerClassName="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="flex items-end gap-5">
          <div className="relative flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-ink/40">
            <Sparkles className="h-1/3 w-1/3" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-ink/70">
              <Sparkles className="h-3.5 w-3.5" /> Smart playlist
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
              {playlist.name}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {playlist.rules.length === 0 ? (
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted-foreground">
                  matches your whole library
                </span>
              ) : (
                playlist.rules.map((rule, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    {describeRule(rule)}
                  </span>
                ))
              )}
            </div>
            <p className="text-xs text-ink/60">
              {tracks.length} {tracks.length === 1 ? "track" : "tracks"} ·
              updates automatically
            </p>
          </div>
        </div>
        <SmartPlaylistActions
          playlistId={playlist.id}
          initialName={playlist.name}
          initialRules={playlist.rules}
          initialLimit={playlist.limit}
        />
      </HeroCard>

      <section className="mt-8">
        {tracks.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-foreground/15 bg-card p-8 text-center text-sm text-muted-foreground">
            <ListMusic className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
            <p>No tracks match these rules yet.</p>
            <p className="mt-1">
              The playlist fills in automatically as your library, plays, and
              likes change.
            </p>
          </div>
        ) : (
          <MixDetail tracks={tracks} likedTrackIds={likedTrackIds} />
        )}
      </section>
    </main>
  );
}
