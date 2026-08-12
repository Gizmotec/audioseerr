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
      <SkeletonHero />
      <div className="mt-8">
        <SkeletonRows rows={12} />
      </div>
    </SkeletonPage>
  );
}
