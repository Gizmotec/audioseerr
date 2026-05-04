import { Heart, ListMusic } from "lucide-react";
import Link from "next/link";
import type { PlaylistSummary } from "@/lib/playlists";

export function PlaylistTile({ playlist }: { playlist: PlaylistSummary }) {
  const isCustomCover = !!playlist.coverUrl && playlist.coverUrls[0] !== playlist.coverUrl;
  const showSingleCover =
    !!playlist.coverUrl && (isCustomCover || playlist.coverUrls.length <= 1);
  const gridCovers = playlist.coverUrls.slice(0, 4);
  const fallbackIcon =
    playlist.system === "liked-songs" ? (
      <Heart className="h-1/3 w-1/3" />
    ) : (
      <ListMusic className="h-1/3 w-1/3" />
    );

  return (
    <Link
      href={`/playlists/${playlist.id}`}
      className="group flex flex-col gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-square overflow-hidden rounded-md bg-secondary">
        {showSingleCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={playlist.coverUrl!}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : gridCovers.length > 1 ? (
          <div className="grid h-full w-full grid-cols-2 grid-rows-2 transition-transform duration-200 group-hover:scale-[1.02]">
            {gridCovers.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${url}-${i}`}
                src={url}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            {fallbackIcon}
          </div>
        )}
      </div>
      <div className="space-y-0.5">
        <p className="truncate text-sm font-medium leading-snug" title={playlist.name}>
          {playlist.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {playlist.trackCount} {playlist.trackCount === 1 ? "track" : "tracks"}
        </p>
      </div>
    </Link>
  );
}
