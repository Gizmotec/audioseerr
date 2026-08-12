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
    <SkeletonPage>
      <SkeletonPageHeader />
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    </SkeletonPage>
  );
}
