"use client";

import { CheckCircle2, Download, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
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
    inLibrary ||
    status === "PENDING" ||
    status === "APPROVED" ||
    status === "DOWNLOADING" ||
    status === "AVAILABLE";

  if (blocking) {
    return (
      <span
        className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground"
        title={inLibrary ? "Track in your library" : ACTIVE_LABEL[status!]}
        aria-label={inLibrary ? "Track in your library" : ACTIVE_LABEL[status!]}
      >
        <CheckCircle2 className="h-4 w-4" />
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
        title="Request track"
        aria-label="Request track"
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
