"use client";

import { Disc3, Loader2, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LibraryStatus } from "@/lib/library";
import type { TrackWithPreview } from "./page";
import { type ExistingRequestStatus, RequestButton } from "./RequestButton";

type AlbumHero = {
  mbid: string;
  title: string;
  artistName: string;
  firstReleaseDate: string | null;
  primaryType: string | null;
  coverUrl: string;
};

type AudioState = "idle" | "loading" | "playing" | "paused";

export function AlbumDetail({
  album,
  tracks,
  existingStatus,
  libraryStatus,
}: {
  album: AlbumHero;
  tracks: TrackWithPreview[];
  existingStatus: ExistingRequestStatus | null;
  libraryStatus: LibraryStatus | null;
}) {
  const [coverOk, setCoverOk] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeTrack, setActiveTrack] = useState<number | null>(null);
  const [state, setState] = useState<AudioState>("idle");

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onWaiting = () => setState("loading");
    const onPlaying = () => setState("playing");
    const onPause = () => setState((s) => (s === "playing" ? "paused" : s));
    const onEnded = () => {
      setState("idle");
      setActiveTrack(null);
    };
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePreview = (track: TrackWithPreview) => {
    const el = audioRef.current;
    if (!el || !track.previewUrl) return;

    if (activeTrack === track.position) {
      if (state === "playing") {
        el.pause();
      } else {
        void el.play();
      }
      return;
    }

    el.src = track.previewUrl;
    setActiveTrack(track.position);
    setState("loading");
    void el.play();
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
            {album.artistName}
            {year ? ` · ${year}` : ""}
          </p>

          <div className="mt-2">
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
              const isActive = activeTrack === t.position;
              const playable = !!t.previewUrl;
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
                        ? isActive && state === "playing"
                          ? "Pause preview"
                          : "Play preview"
                        : "No preview available"
                    }
                  >
                    {isActive && state === "loading" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isActive && state === "playing" ? (
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
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatDuration(t.lengthMs)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <audio ref={audioRef} preload="none" />
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
