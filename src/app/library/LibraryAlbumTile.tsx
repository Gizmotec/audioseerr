"use client";

import { Disc3 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { InLibraryBadge } from "@/components/InLibraryBadge";
import { formatTrackLine } from "@/app/search/AlbumCard";
import type { LibraryStatus } from "@/lib/library";

export type LibraryTileItem = {
  mbid: string;
  title: string;
  artistName: string;
  status: LibraryStatus;
  trackFileCount: number;
  totalTrackCount: number;
};

export function LibraryAlbumTile({ item }: { item: LibraryTileItem }) {
  const [imgOk, setImgOk] = useState(true);
  // The LibraryItem.mbid is Lidarr's foreignAlbumId i.e. the release-group MBID,
  // so coverartarchive resolves directly. Falls back to the Disc3 placeholder
  // for albums without front art.
  const coverUrl = `https://coverartarchive.org/release-group/${item.mbid}/front-250`;
  const trackLine = formatTrackLine({
    status: item.status,
    trackFileCount: item.trackFileCount,
    totalTrackCount: item.totalTrackCount,
    lidarrId: 0,
  });

  return (
    <Link
      href={`/album/${item.mbid}`}
      className="group flex flex-col gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-square overflow-hidden rounded-md bg-secondary">
        {imgOk ? (
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
        {item.status !== "downloaded" && (
          <InLibraryBadge status={item.status} />
        )}
      </div>
      <div className="space-y-0.5">
        <p
          className="truncate text-sm font-medium leading-snug"
          title={item.title}
        >
          {item.title}
        </p>
        <p
          className="truncate text-xs text-muted-foreground"
          title={item.artistName}
        >
          {item.artistName}
          {trackLine ? ` · ${trackLine}` : ""}
        </p>
      </div>
    </Link>
  );
}
