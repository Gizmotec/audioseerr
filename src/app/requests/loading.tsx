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
      <div className="mb-6 flex gap-2">
        <SkeletonBlock className="h-9 w-28 rounded-full" />
        <SkeletonBlock className="h-9 w-28 rounded-full" />
      </div>
      <SkeletonRows rows={10} />
    </SkeletonPage>
  );
}
