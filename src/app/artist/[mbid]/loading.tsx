// Artist page: MusicBrainz release groups, Deezer top tracks and Last.fm
// stats all resolve server-side, so this stands in the moment the link is hit.
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
      <SkeletonHero round />
      <div className="mt-8 space-y-8">
        <SkeletonSection titleWidth="w-24">
          <SkeletonRows rows={8} artwork={false} />
        </SkeletonSection>
        <SkeletonSection titleWidth="w-28">
          <SkeletonCardGrid count={10} />
        </SkeletonSection>
      </div>
    </SkeletonPage>
  );
}
