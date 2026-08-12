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
      <SkeletonPageHeader actions={1} />
      <SkeletonRows rows={8} artwork={false} />
    </SkeletonPage>
  );
}
