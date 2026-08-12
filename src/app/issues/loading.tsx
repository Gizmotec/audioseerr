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
      <SkeletonRows rows={6} artwork={false} />
    </SkeletonPage>
  );
}
