"use client";

import { CheckCircle2, Download, Loader2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
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

const ACTIVE_LABEL: Record<ExistingRequestStatus, string> = {
  PENDING: "Track request pending",
  APPROVED: "Track request approved",
  DOWNLOADING: "Track downloading",
  AVAILABLE: "Track available",
  DECLINED: "Track declined",
  FAILED: "Track failed",
};

export function RequestTrackButton({
  track,
  existingStatus,
  inLibrary,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(existingStatus);
  const [error, setError] = useState<string | null>(null);

  const blocking =
    status === "PENDING" ||
    status === "APPROVED" ||
    status === "DOWNLOADING" ||
    status === "AVAILABLE";

  if (inLibrary) {
    return (
      <span
        className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground"
        title="Track in your library"
        aria-label="Track in your library"
      >
        <CheckCircle2 className="h-4 w-4" />
      </span>
    );
  }

  if (blocking) {
    return (
      <span className="relative inline-flex h-8 w-8 items-center justify-center">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={pending}
          title="Unrequest track"
          aria-label={`Unrequest track: ${ACTIVE_LABEL[status!]}`}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await unrequestAction({
                type: "TRACK",
                mbid: track.recordingMbid ?? `${track.albumMbid}:${track.albumPosition}`,
                albumMbid: track.albumMbid,
              });
              if (result.ok) setStatus(null);
              else setError(result.error);
            });
          }}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
        </Button>
        {error && (
          <span
            role="alert"
            className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border bg-background p-2 text-xs text-destructive shadow"
          >
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="relative inline-flex h-8 w-8 items-center justify-center">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={pending}
        title="Download track"
        aria-label="Download track"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await requestTrackAction(track);
            if (result.ok) setStatus("PENDING");
            else setError(result.error);
          });
        }}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </Button>
      {error && (
        <span
          role="alert"
          className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border bg-background p-2 text-xs text-destructive shadow"
        >
          {error}
        </span>
      )}
    </span>
  );
}
