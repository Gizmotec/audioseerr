"use client";

import { Disc3, Heart, Music2, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { LastFmChartArtist, LastFmChartTrack } from "@/lib/lastfm";
import type { MostLovedRow } from "@/lib/mostLoved";

const RANK_FILLS = [
  "bg-pastel-pink",
  "bg-pastel-yellow",
  "bg-pastel-mint",
  "bg-pastel-sky",
  "bg-pastel-lavender",
];

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
          ? "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-ink bg-surface-2 text-muted-foreground/50"
          : "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-ink bg-surface-2 text-muted-foreground/50"
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
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
        <span className="shrink-0 -rotate-1 rounded-full border-2 border-ink bg-surface-2 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          {source}
        </span>
      </header>
      {children}
    </section>
  );
}

function ChartRow({
  index,
  href,
  artwork,
  title,
  sub,
}: {
  index: number;
  href: string;
  artwork: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="group grid min-h-16 grid-cols-[2rem_2.75rem_1fr] items-center gap-3 rounded-xl border-2 border-ink bg-surface px-3 py-2 transition-all hover:-translate-y-0.5 hover:bg-surface-2 hover:shadow-[4px_4px_0_0_var(--color-ink)]"
    >
      <span
        className={`flex h-7 w-7 -rotate-3 items-center justify-center rounded-lg border-2 border-ink font-mono text-[11px] font-bold text-ink transition-transform group-hover:rotate-0 ${RANK_FILLS[index % RANK_FILLS.length]}`}
      >
        {index + 1}
      </span>
      {artwork}
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold" title={title}>
          {title}
        </span>
        <span className="block truncate text-xs text-muted-foreground" title={sub}>
          {sub}
        </span>
      </span>
    </Link>
  );
}

export function TopTracksChart({ tracks }: { tracks: LastFmChartTrack[] }) {
  if (tracks.length === 0) return null;

  return (
    <ChartSection title="Top tracks" source="Last.fm">
      <ol className="grid gap-2.5 md:grid-cols-2">
        {tracks.map((track, index) => (
          <li key={`${track.artistName}-${track.name}`}>
            <ChartRow
              index={index}
              href={trackHref(track)}
              artwork={<Artwork src={track.imageUrl} kind="track" />}
              title={track.name}
              sub={`${track.artistName} · ${compactNumber(track.listeners)} listeners`}
            />
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
      <ol className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {artists.map((artist, index) => (
          <li key={`${artist.mbid ?? artist.name}-${index}`}>
            <ChartRow
              index={index}
              href={artistHref(artist)}
              artwork={<Artwork src={artist.imageUrl} kind="artist" />}
              title={artist.name}
              sub={`${compactNumber(artist.listeners)} listeners`}
            />
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
      <ol className="grid gap-2.5 md:grid-cols-2">
        {items.map((item, index) => (
          <li key={`${item.targetType}-${item.targetId}`}>
            <ChartRow
              index={index}
              href={lovedHref(item)}
              artwork={
                <Artwork
                  src={item.coverUrl ?? (item.albumMbid ? `https://coverartarchive.org/release-group/${item.albumMbid}/front-250` : null)}
                  kind={item.targetType === "ARTIST" ? "artist" : "loved"}
                />
              }
              title={item.title}
              sub={lovedMeta(item)}
            />
          </li>
        ))}
      </ol>
    </ChartSection>
  );
}
