"use client";

import { useCallback, useState, useTransition } from "react";
import {
  DownloadButton,
  useDownloadState,
} from "@/components/DownloadIndicator";
import { useToast } from "@/components/Toaster";
import { unrequestAction } from "@/lib/actions/requests";
import { requestTrackAction } from "./actions";
import type { ExistingRequestStatus } from "./RequestButton";

type Props = {
  track: {
    albumMbid: string;
    albumTitle: string;
    artistName: string;
    coverUrl: string | null;
    recordingMbid: string | null;
    trackTitle: string;
    albumPosition: number;
  };
  existingStatus: ExistingRequestStatus | null;
  inLibrary: boolean;
};

export function RequestTrackButton({
  track,
  existingStatus,
  inLibrary,
}: Props) {
  const [, startTransition] = useTransition();
  const [unrequested, setUnrequested] = useState(false);
  const toast = useToast();

  // The same key the request row is stored under, so live progress from slskd
  // finds this row without the request id ever reaching the client.
  const trackKey =
    track.recordingMbid ?? `${track.albumMbid}:${track.albumPosition}`;

  const status = unrequested ? null : existingStatus;
  const owned = inLibrary || status === "AVAILABLE";
  const active =
    status === "PENDING" || status === "APPROVED" || status === "DOWNLOADING";
  // The request completed but there's no file to stream — the copy on disk was
  // pruned or never registered. Keep the unrequest reachable so the user can
  // clear it and ask again; otherwise the row is a check that plays nothing.
  const strandedAvailable = status === "AVAILABLE" && !inLibrary;

  const submit = useCallback(() => requestTrackAction(track), [track]);
  const state = useDownloadState({
    trackKey,
    owned,
    active,
    subject: track.trackTitle,
    submit,
  });

  const { reset } = state;
  const cancel = useCallback(() => {
    reset();
    startTransition(async () => {
      const result = await unrequestAction({
        type: "TRACK",
        mbid: trackKey,
        albumMbid: track.albumMbid,
      });
      if (result.ok) setUnrequested(true);
      else toast.error(result.error, track.trackTitle);
    });
  }, [reset, trackKey, track.albumMbid, track.trackTitle, toast]);

  const offerCancel = state.busy || strandedAvailable;
  return (
    <DownloadButton state={state} onCancel={offerCancel ? cancel : undefined} />
  );
}
