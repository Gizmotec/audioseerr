"use client";

import { Disc3 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { InLibraryBadge } from "@/components/InLibraryBadge";
import { LikedBadge } from "@/components/LikedBadge";
import type { LibraryHit } from "@/lib/library";
import { formatTrackLine } from "@/app/search/AlbumCard";

export type DiscoveryAlbum = {
  mbid: string | null;
  title: string;
  artistName: string;
  coverUrl: string | null;
};

export function DiscoveryAlbumCard({
  album,
  libraryHit,
  liked,
}: {
  album: DiscoveryAlbum;
  libraryHit?: LibraryHit | null;
  liked?: boolean;
}) {
  const [imgOk, setImgOk] = useState(album.coverUrl !== null);
  const trackLine = formatTrackLine(libraryHit ?? null);

  // Without an MBID (e.g. Deezer chart cards), bounce through a server route
  // that resolves artist+title to an MBID via MusicBrainz, then redirects to
  // /album/[mbid]. Falls back to /search if MB has no match.
  const href = album.mbid
    ? `/album/${album.mbid}`
    : `/api/resolve-album?artist=${encodeURIComponent(album.artistName)}&title=${encodeURIComponent(album.title)}`;

  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-square overflow-hidden rounded-md bg-secondary">
        {imgOk && album.coverUrl ? (
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
        <InLibraryBadge status={libraryHit?.status ?? null} />
        <LikedBadge liked={!!liked} />
      </div>
      <div className="space-y-0.5">
        <p
          className="truncate text-sm font-medium leading-snug"
          title={album.title}
        >
          {album.title}
        </p>
        <p
          className="truncate text-xs text-muted-foreground"
          title={album.artistName}
        >
          {album.artistName}
          {trackLine ? ` · ${trackLine}` : ""}
        </p>
      </div>
    </Link>
  );
}
