import {
  SkeletonCardGrid,
  SkeletonHero,
  SkeletonPage,
  SkeletonPageHeader,
  SkeletonRows,
  SkeletonSection,
  SkeletonBlock,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonPage width="max-w-3xl">
      <SkeletonPageHeader />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    </SkeletonPage>
  );
}
