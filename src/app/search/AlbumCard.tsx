"use client";

import { Disc3 } from "lucide-react";
import Link from "next/link";
import { LinkPendingOverlay } from "@/components/LinkPending";
import { useState } from "react";
import { LikedBadge } from "@/components/LikedBadge";
import type { LibraryHit } from "@/lib/library";
import type { MbAlbum } from "@/lib/musicbrainz";

/**
 * Cover source ladder: the Cover Art Archive URL MusicBrainz implies, then a
 * Deezer lookup, then the placeholder disc. The Archive has no art for a large
 * share of release groups, which is why the second step exists — it only costs
 * a request for the covers that actually failed.
 */
function useCoverFallback(album: MbAlbum) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const deezerUrl = `/api/cover/album?artist=${encodeURIComponent(
    album.artistName,
  )}&title=${encodeURIComponent(album.title)}`;
  return {
    src: step === 0 ? album.coverUrl : deezerUrl,
    exhausted: step === 2,
    onError: () => setStep((s) => (s === 0 ? 1 : 2)),
  };
}

export function AlbumCard({
  album,
  liked,
}: {
  album: MbAlbum;
  liked?: boolean;
}) {
  const cover = useCoverFallback(album);
  const year = album.firstReleaseDate?.slice(0, 4);

  return (
    <Link
      href={`/album/${album.mbid}`}
      className="group flex flex-col gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-secondary">
        {!cover.exhausted ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={cover.src}
            src={cover.src}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            onError={cover.onError}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <Disc3 className="h-1/3 w-1/3" />
          </div>
        )}
        <LikedBadge liked={!!liked} />
        <LinkPendingOverlay />
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
