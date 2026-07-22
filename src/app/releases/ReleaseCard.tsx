"use client";

import { Disc3 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export type ReleaseCardProps = {
  /** Release-group MBID — the /album/[mbid] route id. */
  mbid: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
  /** Raw MB first-release-date (may be partial: "2026", "2026-06"). */
  firstReleaseDate: string | null;
};

// Cover handling mirrors DiscoveryAlbumCard: plain <img> (external host not
// in next/image config), hidden on error so the Disc3 fallback shows.
export function ReleaseCard({
  mbid,
  title,
  artistName,
  coverUrl,
  firstReleaseDate,
}: ReleaseCardProps) {
  const [imgOk, setImgOk] = useState(coverUrl !== null);

  return (
    <Link
      href={`/album/${mbid}`}
      className="group flex flex-col gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-square overflow-hidden rounded-md bg-secondary">
        {imgOk && coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <Disc3 className="h-1/3 w-1/3" />
          </div>
        )}
      </div>
      <div className="space-y-0.5">
        <p className="truncate text-sm font-medium leading-snug" title={title}>
          {title}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={artistName}>
          {artistName}
        </p>
        {firstReleaseDate && (
          <p className="font-mono text-[11px] text-muted-foreground/70">
            {firstReleaseDate}
          </p>
        )}
      </div>
    </Link>
  );
}
