import { Heart } from "lucide-react";

/**
 * Tiny heart anchored to the top-right of an album cover. Pairs with the
 * InLibraryBadge (bottom-left) without overlap. Absent when the user hasn't
 * liked the album so we don't clutter discovery rows.
 */
export function LikedBadge({ liked }: { liked: boolean }) {
  if (!liked) return null;
  return (
    <span
      className="absolute top-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/90 text-white shadow-sm"
      title="Liked"
      aria-label="Liked"
    >
      <Heart className="h-3 w-3" fill="currentColor" strokeWidth={0} />
    </span>
  );
}
