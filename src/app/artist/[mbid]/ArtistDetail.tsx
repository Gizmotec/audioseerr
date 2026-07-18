"use client";

import { User } from "lucide-react";
import { useState } from "react";
import { HeroCard } from "@/components/HeroCard";
import { SevenDigitalButton } from "@/components/SevenDigitalButton";
import { LikeButton } from "@/components/LikeButton";
import { RemoveFromLibraryButton } from "@/components/RemoveFromLibraryButton";
import { type ArtistTopTrack, TopTracksList } from "@/components/TopTracksList";
import {
  type ExistingArtistRequestStatus,
  RequestArtistButton,
} from "./RequestArtistButton";

export type { ArtistTopTrack };

type ArtistHero = {
  mbid: string;
  name: string;
  type: string | null;
  imageUrl: string | null;
  meta: string;
  bio: string | null;
};

export function ArtistDetail({
  artist,
  topTracks,
  existingStatus,
  hasLastFmKey,
  liked,
  sevenDigitalUrl,
  canRemoveFromLibrary = false,
}: {
  artist: ArtistHero;
  topTracks: ArtistTopTrack[];
  existingStatus: ExistingArtistRequestStatus | null;
  hasLastFmKey: boolean;
  liked: boolean;
  sevenDigitalUrl: string;
  canRemoveFromLibrary?: boolean;
}) {
  const [imgOk, setImgOk] = useState(artist.imageUrl !== null);
  const [bioExpanded, setBioExpanded] = useState(false);

  // 320 chars feels right for the hero — short enough to glance at, long
  // enough to be more than a tagline. Full text is one click away.
  const bioPreviewLength = 320;
  const showBioToggle = (artist.bio?.length ?? 0) > bioPreviewLength;
  const bioText = artist.bio
    ? bioExpanded || !showBioToggle
      ? artist.bio
      : `${artist.bio.slice(0, bioPreviewLength).trimEnd()}…`
    : null;

  return (
    <div className="flex flex-col gap-8">
      <HeroCard
        seed={artist.name}
        innerClassName="flex flex-col gap-6 md:flex-row md:items-end"
      >
        <div className="relative h-56 w-56 shrink-0 overflow-hidden rounded-full bg-ink/10 md:h-64 md:w-64">
          {imgOk && artist.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artist.imageUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
              onError={() => setImgOk(false)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink/40">
              <User className="h-1/3 w-1/3" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-wider text-ink/70">
            {artist.type ?? "Artist"}
          </p>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
            {artist.name}
          </h1>
          <p className="text-sm text-ink/70">{artist.meta}</p>

          {bioText && (
            <p className="max-w-prose text-sm leading-relaxed text-ink/70">
              {bioText}
              {showBioToggle && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => setBioExpanded((v) => !v)}
                    className="font-bold text-ink hover:underline"
                  >
                    {bioExpanded ? "Show less" : "Read more"}
                  </button>
                </>
              )}
            </p>
          )}
          {!bioText && hasLastFmKey && (
            <p className="text-sm text-ink/60">No bio available.</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <RequestArtistButton
              artist={{
                mbid: artist.mbid,
                name: artist.name,
                imageUrl: artist.imageUrl,
              }}
              existingStatus={existingStatus}
            />
            <LikeButton
              payload={{
                targetType: "ARTIST",
                targetId: artist.mbid,
                title: artist.name,
                coverUrl: artist.imageUrl,
              }}
              initialLiked={liked}
            />
            <SevenDigitalButton href={sevenDigitalUrl} label="Find on 7digital" />
            {canRemoveFromLibrary && (
              <RemoveFromLibraryButton
                target={{ type: "artist", mbid: artist.mbid, name: artist.name }}
              />
            )}
          </div>
        </div>
      </HeroCard>

      <TopTracksList
        artistName={artist.name}
        artistImageUrl={artist.imageUrl}
        topTracks={topTracks}
      />
    </div>
  );
}
