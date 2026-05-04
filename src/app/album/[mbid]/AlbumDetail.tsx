"use client";

import { Disc3, Loader2, Pause, Play } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AddToPlaylistButton,
  type PlaylistOption,
} from "@/components/AddToPlaylistButton";
import { AppleMusicButton } from "@/components/AppleMusicButton";
import { LikeButton } from "@/components/LikeButton";
import { usePreviewPlayer } from "@/components/PreviewPlayer";
import { YouTubeButton } from "@/components/YouTubeButton";
import type { LibraryStatus } from "@/lib/library";
import type { TrackWithPreview } from "./page";
import { type ExistingRequestStatus, RequestButton } from "./RequestButton";

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
  playlists,
  appleMusicUrl,
}: {
  album: AlbumHero;
  tracks: TrackWithPreview[];
  existingStatus: ExistingRequestStatus | null;
  libraryStatus: LibraryStatus | null;
  albumLiked: boolean;
  likedRecordingMbids: string[];
  playlists: PlaylistOption[];
  appleMusicUrl: string;
}) {
  const likedTracks = useMemo(
    () => new Set(likedRecordingMbids),
    [likedRecordingMbids],
  );
  const [coverOk, setCoverOk] = useState(true);
  const player = usePreviewPlayer();

  const togglePreview = (track: TrackWithPreview) => {
    // Full local stream takes priority over the 30s Deezer preview when the
    // file is on disk.
    const url = track.streamUrl ?? track.previewUrl;
    if (!url) return;
    player.play({
      id: url,
      title: track.title,
      artistName: album.artistName,
      coverUrl: album.coverUrl,
      previewUrl: url,
    });
  };

  const year = album.firstReleaseDate?.slice(0, 4);
  const typeLabel = album.primaryType ?? "Album";

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
            <AppleMusicButton href={appleMusicUrl} label="Buy on Apple Music" />
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
            {tracks.map((t) => {
              const playUrl = t.streamUrl ?? t.previewUrl;
              const playable = !!playUrl;
              const isActive = playable && player.isCurrent(playUrl!);
              const isFull = !!t.streamUrl;
              return (
                <li
                  key={`${t.position}-${t.title}`}
                  className={`flex items-center gap-4 py-2.5 ${
                    isActive ? "bg-secondary/40" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => togglePreview(t)}
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
                  <YouTubeButton
                    artistName={album.artistName}
                    trackTitle={t.title}
                  />
                  {t.trackFileId && t.recordingMbid ? (
                    <AddToPlaylistButton
                      payload={{
                        recordingMbid: t.recordingMbid,
                        trackFileId: t.trackFileId,
                        albumMbid: album.mbid,
                        albumPosition: t.position,
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
                  {t.recordingMbid ? (
                    <LikeButton
                      payload={{
                        targetType: "TRACK",
                        targetId: t.recordingMbid,
                        title: t.title,
                        artistName: album.artistName,
                        albumMbid: album.mbid,
                        albumTitle: album.title,
                        coverUrl: album.coverUrl,
                      }}
                      initialLiked={likedTracks.has(t.recordingMbid)}
                      variant="icon"
                    />
                  ) : (
                    <span className="inline-block h-8 w-8" aria-hidden />
                  )}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatDuration(t.lengthMs)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

    </div>
  );
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
