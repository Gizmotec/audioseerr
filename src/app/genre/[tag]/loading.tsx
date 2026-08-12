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
      <div className="mt-4 mb-6 flex items-end gap-4">
        <SkeletonBlock className="h-24 w-24 sm:h-32 sm:w-32" />
        <div className="space-y-2">
          <SkeletonBlock className="h-8 w-48" />
          <SkeletonBlock className="h-4 w-32" />
        </div>
      </div>
      <SkeletonCardGrid count={12} />
    </SkeletonPage>
  );
}
