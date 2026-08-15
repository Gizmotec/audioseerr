import {
  SkeletonBlock,
  SkeletonPage,
  SkeletonPageHeader,
} from "@/components/skeletons";

// Mirrors NotificationRow: a square artwork tile, then title / body / time.
export default function Loading() {
  return (
    <SkeletonPage width="max-w-3xl">
      <SkeletonPageHeader actions={1} />
      <ul className="divide-y divide-border/50" aria-busy="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className="flex items-start gap-4 px-2 py-4">
            <SkeletonBlock className="size-12 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-48" />
              <SkeletonBlock className="h-3.5 w-2/3" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonPage>
  );
}
