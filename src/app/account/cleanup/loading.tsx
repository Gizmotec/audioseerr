import { SkeletonBlock, SkeletonPage } from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonPage width="max-w-3xl">
      <div className="mt-4 mb-8 space-y-2">
        <SkeletonBlock className="h-8 w-48" />
        <SkeletonBlock className="h-4 w-full max-w-lg" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <SkeletonBlock className="mt-6 h-24 rounded-2xl" />
      <SkeletonBlock className="mt-6 h-80 rounded-2xl" />
    </SkeletonPage>
  );
}
