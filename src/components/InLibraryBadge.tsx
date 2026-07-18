import { Check, Disc3 } from "lucide-react";
import type { LibraryStatus } from "@/lib/library";

/**
 * Small overlay badge anchored to the bottom-left of an album cover. Only
 * renders when the album is in the Lidarr library; absent for items not yet
 * known to Lidarr so we don't clutter discovery rows.
 */
export function InLibraryBadge({ status }: { status: LibraryStatus | null }) {
  if (!status) return null;
  if (status === "downloaded") {
    return (
      <span
        className="absolute bottom-1.5 left-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-pastel-mint text-ink"
        title="In your library"
        aria-label="In your library"
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      className="absolute bottom-1.5 left-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-pastel-sky text-ink"
      title={status === "downloading" ? "Downloading" : "Monitored, not downloaded"}
      aria-label={status === "downloading" ? "Downloading" : "Monitored, not downloaded"}
    >
      <Disc3 className="h-3 w-3 animate-pulse" />
    </span>
  );
}
