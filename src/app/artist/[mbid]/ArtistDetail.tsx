"use client";

import { Loader2, Pause, Play, User } from "lucide-react";
import { useState } from "react";
import { AppleMusicButton } from "@/components/AppleMusicButton";
import { LikeButton } from "@/components/LikeButton";
import { usePreviewPlayer } from "@/components/PreviewPlayer";
import { RemoveFromLibraryButton } from "@/components/RemoveFromLibraryButton";
import { YouTubeButton } from "@/components/YouTubeButton";
import type { DeezerArtistTopTrack } from "@/lib/deezer";
import {
  type ExistingArtistRequestStatus,
  RequestArtistButton,
} from "./RequestArtistButton";

type ArtistHero = {
  mbid: string;
  name: string;
  type: string | null;
  imageUrl: string | null;
  meta: string;
  bio: string | null;
};

export type ArtistTopTrack = DeezerArtistTopTrack & {
  listeners: number | null;
  playcount: number | null;
};

export function ArtistDetail({
  artist,
  topTracks,
  existingStatus,
  hasLastFmKey,
  liked,
  appleMusicUrl,
  canRemoveFromLibrary = false,
}: {
  artist: ArtistHero;
  topTracks: ArtistTopTrack[];
  existingStatus: ExistingArtistRequestStatus | null;
  hasLastFmKey: boolean;
  liked: boolean;
  appleMusicUrl: string;
  canRemoveFromLibrary?: boolean;
}) {
  const [imgOk, setImgOk] = useState(artist.imageUrl !== null);
  const [bioExpanded, setBioExpanded] = useState(false);
  const player = usePreviewPlayer();

  const togglePreview = (track: DeezerArtistTopTrack) => {
    if (!track.previewUrl) return;
    player.play({
      id: track.previewUrl,
      title: track.title,
      artistName: artist.name,
      coverUrl: track.albumCover ?? artist.imageUrl,
      previewUrl: track.previewUrl,
    });
  };

  // 320 chars feels right for the hero — short enough to glance at, long
  // enough to be more than a tagline. Full text is one click away.
  const bioPreviewLength = 320;
  const showBioToggle = (artist.bio?.length ?? 0) > bioPreviewLength;
  const bioText = artist.bio
    ? bioExpanded || !showBioToggle
      ? artist.bio
      : `${artist.bio.slice(0, bioPreviewLength).trimEnd()}…`
    : null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-6 md:flex-row md:items-end">
        <div className="relative h-56 w-56 shrink-0 overflow-hidden rounded-full bg-secondary shadow-lg md:h-64 md:w-64">
          {imgOk && artist.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artist.imageUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
              onError={() => setImgOk(false)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
              <User className="h-1/3 w-1/3" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {artist.type ?? "Artist"}
          </p>
          <h1 className="text-3xl font-semibold leading-tight md:text-5xl">
            {artist.name}
          </h1>
          <p className="text-sm text-muted-foreground">{artist.meta}</p>

          {bioText && (
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {bioText}
              {showBioToggle && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => setBioExpanded((v) => !v)}
                    className="text-foreground hover:underline"
                  >
                    {bioExpanded ? "Show less" : "Read more"}
                  </button>
                </>
              )}
            </p>
          )}
          {!bioText && hasLastFmKey && (
            <p className="text-sm text-muted-foreground/70">No bio available.</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <RequestArtistButton
              artist={{
                mbid: artist.mbid,
                name: artist.name,
                imageUrl: artist.imageUrl,
              }}
              existingStatus={existingStatus}
            />
            <LikeButton
              payload={{
                targetType: "ARTIST",
                targetId: artist.mbid,
                title: artist.name,
                coverUrl: artist.imageUrl,
              }}
              initialLiked={liked}
            />
            <AppleMusicButton href={appleMusicUrl} label="Find on Apple Music" />
            {canRemoveFromLibrary && (
              <RemoveFromLibraryButton
                target={{ type: "artist", mbid: artist.mbid, name: artist.name }}
              />
            )}
          </div>
        </div>
      </header>

      {topTracks.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Top tracks
          </h2>
          <ol className="divide-y divide-border/50">
            {topTracks.map((t, i) => {
              const playable = !!t.previewUrl;
              const isActive = playable && player.isCurrent(t.previewUrl!);
              return (
                <li
                  key={`${i}-${t.title}`}
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
                          ? "Pause preview"
                          : "Play preview"
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
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate" title={t.title}>
                      {t.title}
                    </p>
                    {t.albumTitle && (
                      <p
                        className="truncate text-xs text-muted-foreground"
                        title={t.albumTitle}
                      >
                        {t.albumTitle}
                      </p>
                    )}
                  </div>
                  {t.listeners !== null && t.listeners > 0 && (
                    <span
                      className="hidden text-xs text-muted-foreground tabular-nums sm:inline"
                      title={`${t.listeners.toLocaleString()} Last.fm listeners`}
                    >
                      {formatListenerCount(t.listeners)}
                    </span>
                  )}
                  <YouTubeButton
                    artistName={artist.name}
                    trackTitle={t.title}
                  />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatDuration(t.durationMs)}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

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
