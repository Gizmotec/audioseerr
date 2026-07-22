import { Sparkles } from "lucide-react";
import Link from "next/link";
import type { SmartPlaylistSummary } from "@/lib/smartPlaylists";

/**
 * Grid tile for a smart playlist on /playlists. Mirrors PlaylistTile's
 * layout; distinguished from manual playlists by the Sparkles "Smart" badge
 * on the cover and the "Smart playlist" subtitle.
 */
export function SmartPlaylistTile({
  playlist,
}: {
  playlist: SmartPlaylistSummary;
}) {
  return (
    <Link
      href={`/playlists/smart/${playlist.id}`}
      className="group flex flex-col gap-2 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-muted-foreground/40">
        <Sparkles className="h-1/3 w-1/3 transition-transform duration-200 group-hover:scale-[1.06]" />
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground">
          <Sparkles className="h-3 w-3" /> Smart
        </span>
      </div>
      <div className="space-y-0.5">
        <p
          className="truncate text-sm font-medium leading-snug"
          title={playlist.name}
        >
          {playlist.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          Smart playlist ·{" "}
          {playlist.rules.length === 0
            ? "all tracks"
            : `${playlist.rules.length} ${playlist.rules.length === 1 ? "rule" : "rules"}`}{" "}
          · up to {playlist.limit}
        </p>
      </div>
    </Link>
  );
}
