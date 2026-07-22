"use client";

import { Disc3, Heart, Music2, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { LastFmChartArtist, LastFmChartTrack } from "@/lib/lastfm";
import type { MostLovedRow } from "@/lib/mostLoved";

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function searchHref(query: string): string {
  return `/search?q=${encodeURIComponent(query)}`;
}

function artistHref(artist: { mbid: string | null; name: string }): string {
  if (artist.mbid) return `/artist/${artist.mbid}`;
  const params = new URLSearchParams({ artist: artist.name });
  return `/api/resolve-artist?${params.toString()}`;
}

function trackHref(track: LastFmChartTrack): string {
  if (!track.albumTitle) {
    return searchHref(`${track.artistName} ${track.name}`);
  }
  const params = new URLSearchParams({
    artist: track.artistName,
    title: track.albumTitle,
  });
  return `/api/resolve-album?${params.toString()}`;
}

function lovedHref(item: MostLovedRow): string {
  if (item.targetType === "ALBUM") return `/album/${item.targetId}`;
  if (item.targetType === "ARTIST") return `/artist/${item.targetId}`;
  if (item.albumMbid) return `/album/${item.albumMbid}`;
  return searchHref([item.artistName, item.title].filter(Boolean).join(" "));
}

function lovedMeta(item: MostLovedRow): string {
  const type =
    item.targetType === "TRACK"
      ? item.artistName
      : item.targetType === "ALBUM"
        ? item.artistName
        : "Artist";
  return [type, `${item.count} like${item.count === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" · ");
}

function Artwork({
  src,
  kind,
}: {
  src: string | null;
  kind: "artist" | "album" | "track" | "loved";
}) {
  const [imgOk, setImgOk] = useState(src !== null);
  const Icon =
    kind === "artist" ? UserRound : kind === "loved" ? Heart : kind === "track" ? Music2 : Disc3;

  return (
    <div
      className={
        kind === "artist"
          ? "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-muted-foreground/50"
          : "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary text-muted-foreground/50"
      }
    >
      {imgOk && src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setImgOk(false)}
        />
      ) : (
        <Icon
          className="h-5 w-5"
          fill={kind === "loved" ? "currentColor" : "none"}
          strokeWidth={kind === "loved" ? 0 : 2}
        />
      )}
    </div>
  );
}

function ChartSection({
  title,
  source,
  children,
}: {
  title: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">{title}</h2>
        <span className="shrink-0 text-xs text-muted-foreground">{source}</span>
      </header>
      {children}
    </section>
  );
}

export function TopTracksChart({ tracks }: { tracks: LastFmChartTrack[] }) {
  if (tracks.length === 0) return null;

  return (
    <ChartSection title="Top tracks" source="Last.fm">
      <ol className="grid gap-2 md:grid-cols-2">
        {tracks.map((track, index) => (
          <li key={`${track.artistName}-${track.name}`}>
            <Link
              href={trackHref(track)}
              className="group grid min-h-16 grid-cols-[2rem_2.75rem_1fr] items-center gap-3 rounded-md border border-border bg-secondary/20 px-3 py-2 hover:border-foreground/30 hover:bg-secondary/50"
            >
              <span className="font-mono text-xs text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <Artwork src={track.imageUrl} kind="track" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium" title={track.name}>
                  {track.name}
                </span>
                <span
                  className="block truncate text-xs text-muted-foreground"
                  title={track.artistName}
                >
                  {track.artistName} · {compactNumber(track.listeners)} listeners
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </ChartSection>
  );
}

export function TopArtistsChart({ artists }: { artists: LastFmChartArtist[] }) {
  if (artists.length === 0) return null;

  return (
    <ChartSection title="Top artists" source="Last.fm">
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {artists.map((artist, index) => (
          <li key={`${artist.mbid ?? artist.name}-${index}`}>
            <Link
              href={artistHref(artist)}
              className="group grid min-h-16 grid-cols-[2rem_2.75rem_1fr] items-center gap-3 rounded-md border border-border bg-secondary/20 px-3 py-2 hover:border-foreground/30 hover:bg-secondary/50"
            >
              <span className="font-mono text-xs text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <Artwork src={artist.imageUrl} kind="artist" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium" title={artist.name}>
                  {artist.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {compactNumber(artist.listeners)} listeners
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </ChartSection>
  );
}

export function MostLovedChart({ items }: { items: MostLovedRow[] }) {
  if (items.length === 0) return null;

  return (
    <ChartSection title="Most loved" source="Audioseerr">
      <ol className="grid gap-2 md:grid-cols-2">
        {items.map((item, index) => (
          <li key={`${item.targetType}-${item.targetId}`}>
            <Link
              href={lovedHref(item)}
              className="group grid min-h-16 grid-cols-[2rem_2.75rem_1fr] items-center gap-3 rounded-md border border-border bg-secondary/20 px-3 py-2 hover:border-foreground/30 hover:bg-secondary/50"
            >
              <span className="font-mono text-xs text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <Artwork
                src={item.coverUrl ?? (item.albumMbid ? `https://coverartarchive.org/release-group/${item.albumMbid}/front-250` : null)}
                kind={item.targetType === "ARTIST" ? "artist" : "loved"}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium" title={item.title}>
                  {item.title}
                </span>
                <span
                  className="block truncate text-xs text-muted-foreground"
                  title={lovedMeta(item)}
                >
                  {lovedMeta(item)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </ChartSection>
  );
}
