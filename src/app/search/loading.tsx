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
      <SkeletonBlock className="mb-8 h-11 w-full rounded-full" />
      <SkeletonSection titleWidth="w-24">
        <SkeletonCardGrid count={10} />
      </SkeletonSection>
    </SkeletonPage>
  );
}
