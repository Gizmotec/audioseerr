"use client";

import { Disc3, Loader2, Pause, Play } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AddToPlaylistButton,
  type PlaylistOption,
} from "@/components/AddToPlaylistButton";
import { SevenDigitalButton } from "@/components/SevenDigitalButton";
import { LikeButton } from "@/components/LikeButton";
import { type QueueItem, usePreviewPlayer } from "@/components/PreviewPlayer";
import { TrackLikeButton } from "@/components/TrackLikeButton";
import { useTrackMenu } from "@/components/TrackMenu";
import { RemoveFromLibraryButton } from "@/components/RemoveFromLibraryButton";
import { YouTubeButton } from "@/components/YouTubeButton";
import type { LibraryStatus } from "@/lib/library";
import type { TrackWithPreview } from "./page";
import { type ExistingRequestStatus, RequestButton } from "./RequestButton";
import { RequestTrackButton } from "./RequestTrackButton";

type AlbumHero = {
  mbid: string;
  title: string;
  artistName: string;
  artistMbid: string | null;
  firstReleaseDate: string | null;
  primaryType: string | null;
  coverUrl: string;
};

export function AlbumDetail({
  album,
  tracks,
  existingStatus,
  libraryStatus,
  albumLiked,
  likedRecordingMbids,
  existingTrackStatuses,
  playlists,
  sevenDigitalUrl,
  canRemoveFromLibrary = false,
}: {
  album: AlbumHero;
  tracks: TrackWithPreview[];
  existingStatus: ExistingRequestStatus | null;
  libraryStatus: LibraryStatus | null;
  albumLiked: boolean;
  likedRecordingMbids: string[];
  existingTrackStatuses: Record<string, ExistingRequestStatus>;
  playlists: PlaylistOption[];
  sevenDigitalUrl: string;
  canRemoveFromLibrary?: boolean;
}) {
  const likedTracks = useMemo(
    () => new Set(likedRecordingMbids),
    [likedRecordingMbids],
  );
  const [coverOk, setCoverOk] = useState(true);
  const player = usePreviewPlayer();
  const { openTrackMenu } = useTrackMenu();

  // Build the album as a playback queue so the player auto-advances and the
  // bar's prev/next controls step through the tracklist. Full local stream
  // takes priority over the 30s Deezer preview when the file is on disk.
  const queueItems = useMemo<QueueItem[]>(
    () =>
      tracks.map((t, idx) => ({
        id: trackQueueId(album.mbid, t, idx),
        title: t.title,
        artistName: album.artistName,
        coverUrl: album.coverUrl,
        streamUrl: t.streamUrl ?? t.previewUrl,
        // Only attach scrobble metadata for full-library streams. Deezer
        // previews are 30s auditions and shouldn't count toward play history.
        recordingMbid: t.streamUrl
          ? (t.recordingMbid ??
            (t.trackFileId
              ? `lidarr:${t.trackFileId}`
              : t.downloadedTrackId
                ? `local:${t.downloadedTrackId}`
                : undefined))
          : undefined,
        albumMbid: t.streamUrl ? album.mbid : undefined,
        durationMs: t.lengthMs ?? undefined,
        likeSeed: {
          recordingMbid: t.recordingMbid ?? null,
          albumMbid: album.mbid,
          albumPosition: t.absolutePosition,
          albumTitle: album.title,
        },
      })),
    [tracks, album.mbid, album.title, album.artistName, album.coverUrl],
  );

  const togglePreview = (track: TrackWithPreview, idx: number) => {
    const url = track.streamUrl ?? track.previewUrl;
    if (!url) return;
    const id = trackQueueId(album.mbid, track, idx);
    if (player.isCurrent(id)) {
      player.toggle();
      return;
    }
    player.playQueue(queueItems, idx);
  };

  const year = album.firstReleaseDate?.slice(0, 4);
  const typeLabel = album.primaryType ?? "Album";

  // Group tracks by disc, preserving each track's index in the full list so
  // queue ids stay stable across the disc separators.
  const discs = useMemo(() => {
    const groups = new Map<number, { disc: number; items: { track: TrackWithPreview; idx: number }[] }>();
    tracks.forEach((track, idx) => {
      const disc = track.mediumNumber ?? 1;
      let group = groups.get(disc);
      if (!group) {
        group = { disc, items: [] };
        groups.set(disc, group);
      }
      group.items.push({ track, idx });
    });
    return Array.from(groups.values()).sort((a, b) => a.disc - b.disc);
  }, [tracks]);
  const showDiscHeaders = discs.length > 1;

  return (
    <div className="mt-6 flex flex-col gap-8">
      <header className="flex flex-col gap-6 md:flex-row md:items-end">
        <div className="relative h-56 w-56 shrink-0 overflow-hidden rounded-lg bg-secondary shadow-lg md:h-64 md:w-64">
          {coverOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={album.coverUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
              onError={() => setCoverOk(false)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
              <Disc3 className="h-1/3 w-1/3" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {typeLabel}
          </p>
          <h1 className="text-3xl font-semibold leading-tight md:text-5xl">
            {album.title}
          </h1>
          <p className="text-lg text-muted-foreground">
            {album.artistMbid ? (
              <Link
                href={`/artist/${album.artistMbid}`}
                className="font-medium text-foreground hover:underline"
              >
                {album.artistName}
              </Link>
            ) : (
              album.artistName
            )}
            {year ? ` · ${year}` : ""}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <RequestButton
              album={{
                mbid: album.mbid,
                title: album.title,
                artistName: album.artistName,
                coverUrl: album.coverUrl,
              }}
              existingStatus={existingStatus}
              libraryStatus={libraryStatus}
            />
            <LikeButton
              payload={{
                targetType: "ALBUM",
                targetId: album.mbid,
                title: album.title,
                artistName: album.artistName,
                coverUrl: album.coverUrl,
              }}
              initialLiked={albumLiked}
            />
            <SevenDigitalButton href={sevenDigitalUrl} label="Buy on 7digital" />
            {canRemoveFromLibrary && libraryStatus && (
              <RemoveFromLibraryButton
                target={{
                  type: "album",
                  mbid: album.mbid,
                  title: album.title,
                  artistName: album.artistName,
                }}
              />
            )}
          </div>
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Tracks
        </h2>
        {tracks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            MusicBrainz didn&apos;t return a tracklist for this release group yet.
          </p>
        ) : (
          <ol className="divide-y divide-border/50">
            {discs.flatMap((group) => {
              const header = showDiscHeaders ? (
                <li
                  key={`disc-${group.disc}`}
                  className="flex items-center gap-2 pt-4 pb-2 text-sm font-medium text-muted-foreground"
                >
                  <Disc3 className="h-4 w-4" />
                  <span>Disc {group.disc}</span>
                </li>
              ) : null;
              const rows = group.items.map(({ track: t, idx }) => {
                const playUrl = t.streamUrl ?? t.previewUrl;
                const playable = !!playUrl;
                const queueId = trackQueueId(album.mbid, t, idx);
                const isActive = playable && player.isCurrent(queueId);
                const isFull = !!t.streamUrl;
                return (
                <li
                  key={`${group.disc}-${t.position}-${t.title}`}
                  onContextMenu={(e) =>
                    openTrackMenu(e, {
                      title: t.title,
                      artistName: album.artistName,
                      recordingMbid: t.recordingMbid,
                    })
                  }
                  className={`flex items-center gap-4 py-2.5 ${
                    isActive ? "bg-secondary/40" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => togglePreview(t, idx)}
                    disabled={!playable}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                      playable
                        ? "border-border hover:border-foreground hover:text-foreground"
                        : "border-border/50 text-muted-foreground/40"
                    }`}
                    aria-label={
                      playable
                        ? isActive && player.state === "playing"
                          ? isFull ? "Pause" : "Pause preview"
                          : isFull ? "Play" : "Play preview"
                        : "No preview available"
                    }
                  >
                    {isActive && player.state === "loading" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isActive && player.state === "playing" ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </button>
                  <span className="w-6 text-right text-xs text-muted-foreground">
                    {t.position}
                  </span>
                  <span className="flex-1 truncate" title={t.title}>
                    {t.title}
                  </span>
                  <RequestTrackButton
                    track={{
                      albumMbid: album.mbid,
                      albumTitle: album.title,
                      artistName: album.artistName,
                      coverUrl: album.coverUrl,
                      recordingMbid: t.recordingMbid,
                      trackTitle: t.title,
                      albumPosition: t.absolutePosition,
                    }}
                    existingStatus={
                      existingTrackStatuses[
                        trackRequestKey(album.mbid, t)
                      ] ?? null
                    }
                    inLibrary={!!t.streamUrl}
                  />
                  <YouTubeButton
                    artistName={album.artistName}
                    trackTitle={t.title}
                  />
                  {t.recordingMbid ? (
                    <AddToPlaylistButton
                      payload={{
                        recordingMbid: t.recordingMbid,
                        // null when we don't have a Lidarr file — adding it
                        // kicks off a Soulseek fetch (auto-fetch on add).
                        trackFileId: t.trackFileId,
                        albumMbid: album.mbid,
                        albumPosition: t.absolutePosition,
                        title: t.title,
                        artistName: album.artistName,
                        albumTitle: album.title,
                        coverUrl: album.coverUrl,
                        durationMs: t.lengthMs,
                      }}
                      initialPlaylists={playlists}
                    />
                  ) : (
                    <span className="inline-block h-8 w-8" aria-hidden />
                  )}
                  <TrackLikeButton
                    track={{
                      recordingMbid: t.recordingMbid ?? null,
                      albumMbid: album.mbid,
                      albumPosition: t.absolutePosition,
                      title: t.title,
                      artistName: album.artistName,
                      albumTitle: album.title,
                      coverUrl: album.coverUrl,
                      durationMs: t.lengthMs,
                    }}
                    initialLiked={
                      t.recordingMbid ? likedTracks.has(t.recordingMbid) : false
                    }
                    variant="icon"
                  />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatDuration(t.lengthMs)}
                  </span>
                </li>
                );
              });
              return header ? [header, ...rows] : rows;
            })}
          </ol>
        )}
      </section>

    </div>
  );
}

function trackQueueId(
  albumMbid: string,
  t: TrackWithPreview,
  idx: number,
): string {
  // idx disambiguates multi-disc releases where t.position is per-disc and
  // collisions otherwise highlight two rows as "currently playing".
  // The source suffix (full file vs 30s preview) makes the id change the moment
  // a download lands: the row is then no longer the player's "current" track, so
  // clicking play loads the full file instead of resuming the loaded preview.
  const source = t.streamUrl ? "full" : "preview";
  return `${albumMbid}:${idx}:${t.position}:${t.recordingMbid ?? t.title}:${source}`;
}

function trackRequestKey(albumMbid: string, t: TrackWithPreview): string {
  return t.recordingMbid ?? `${albumMbid}:${t.absolutePosition}`;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
