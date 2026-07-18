"use client";

import { Disc3 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LikedBadge } from "@/components/LikedBadge";
import type { LibraryHit } from "@/lib/library";
import type { MbAlbum } from "@/lib/musicbrainz";

export function AlbumCard({
  album,
  liked,
}: {
  album: MbAlbum;
  liked?: boolean;
}) {
  const [imgOk, setImgOk] = useState(true);
  const year = album.firstReleaseDate?.slice(0, 4);

  return (
    <Link
      href={`/album/${album.mbid}`}
      className="group flex flex-col gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-square overflow-hidden rounded-xl border-2 border-ink bg-secondary">
        {imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={album.coverUrl}
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
        <LikedBadge liked={!!liked} />
      </div>
      <div className="space-y-0.5">
        <h3
          className="truncate text-sm font-bold leading-snug"
          title={album.title}
        >
          {album.title}
        </h3>
        <p
          className="truncate text-xs text-muted-foreground"
          title={album.artistName}
        >
          {album.artistName}
          {year ? ` · ${year}` : ""}
        </p>
      </div>
    </Link>
  );
}

export function formatTrackLine(hit: LibraryHit | null): string | null {
  if (!hit || hit.totalTrackCount === 0) return null;
  if (hit.trackFileCount >= hit.totalTrackCount) {
    return `${hit.totalTrackCount} tracks`;
  }
  if (hit.trackFileCount === 0) return null;
  return `${hit.trackFileCount}/${hit.totalTrackCount} tracks`;
}
