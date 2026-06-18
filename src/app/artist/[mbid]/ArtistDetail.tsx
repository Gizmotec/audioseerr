"use client";

import { User } from "lucide-react";
import { useState } from "react";
import { AppleMusicButton } from "@/components/AppleMusicButton";
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
  appleMusicUrl,
  canRemoveFromLibrary = false,
}: {
  artist: ArtistHero;
  topTracks: ArtistTopTrack[];
  existingStatus: ExistingArtistRequestStatus | null;
  hasLastFmKey: boolean;
  liked: boolean;
  appleMusicUrl: string;
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
      <header className="flex flex-col gap-6 md:flex-row md:items-end">
        <div className="relative h-56 w-56 shrink-0 overflow-hidden rounded-full bg-secondary shadow-lg md:h-64 md:w-64">
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
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
              <User className="h-1/3 w-1/3" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {artist.type ?? "Artist"}
          </p>
          <h1 className="text-3xl font-semibold leading-tight md:text-5xl">
            {artist.name}
          </h1>
          <p className="text-sm text-muted-foreground">{artist.meta}</p>

          {bioText && (
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {bioText}
              {showBioToggle && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => setBioExpanded((v) => !v)}
                    className="text-foreground hover:underline"
                  >
                    {bioExpanded ? "Show less" : "Read more"}
                  </button>
                </>
              )}
            </p>
          )}
          {!bioText && hasLastFmKey && (
            <p className="text-sm text-muted-foreground/70">No bio available.</p>
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
            <AppleMusicButton href={appleMusicUrl} label="Find on Apple Music" />
            {canRemoveFromLibrary && (
              <RemoveFromLibraryButton
                target={{ type: "artist", mbid: artist.mbid, name: artist.name }}
              />
            )}
          </div>
        </div>
      </header>

      <TopTracksList
        artistName={artist.name}
        artistImageUrl={artist.imageUrl}
        topTracks={topTracks}
      />
    </div>
  );
}
