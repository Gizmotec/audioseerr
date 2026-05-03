"use client";

import { CheckCircle2, Disc3, Loader2, PlusCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { LibraryStatus } from "@/lib/library";
import { requestAlbumAction } from "./actions";

export type ExistingRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "DOWNLOADING"
  | "AVAILABLE"
  | "DECLINED"
  | "FAILED";

type Props = {
  album: {
    mbid: string;
    title: string;
    artistName: string;
    coverUrl: string | null;
  };
  existingStatus: ExistingRequestStatus | null;
  libraryStatus?: LibraryStatus | null;
};

const ACTIVE_LABEL: Record<ExistingRequestStatus, string> = {
  PENDING: "Pending approval",
  APPROVED: "Approved",
  DOWNLOADING: "Downloading",
  AVAILABLE: "In your library",
  DECLINED: "Declined",
  FAILED: "Failed",
};

export function RequestButton({ album, existingStatus, libraryStatus }: Props) {
  const [pending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useState<ExistingRequestStatus | null>(
    existingStatus,
  );
  const [error, setError] = useState<string | null>(null);

  const blocking =
    optimisticStatus === "PENDING" ||
    optimisticStatus === "APPROVED" ||
    optimisticStatus === "DOWNLOADING" ||
    optimisticStatus === "AVAILABLE";

  if (blocking) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <span className="text-muted-foreground">
          {ACTIVE_LABEL[optimisticStatus!]}
        </span>
      </div>
    );
  }

  // The user has no active request, but Lidarr already knows about this
  // album. Don't offer a redundant Request button.
  if (libraryStatus === "downloaded") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        <span className="text-muted-foreground">In your library</span>
      </div>
    );
  }
  if (libraryStatus === "downloading") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Disc3 className="h-4 w-4 animate-pulse text-muted-foreground" />
        <span className="text-muted-foreground">Lidarr is downloading this</span>
      </div>
    );
  }
  if (libraryStatus === "missing") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Disc3 className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">
          Already in Lidarr (not yet downloaded)
        </span>
      </div>
    );
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await requestAlbumAction(album);
      if (result.ok) {
        setOptimisticStatus("PENDING");
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={pending} className="gap-2">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlusCircle className="h-4 w-4" />
          )}
          {pending ? "Submitting…" : "Request album"}
        </Button>
        {optimisticStatus === "DECLINED" && (
          <span className="text-xs text-muted-foreground">
            Previously declined — submitting will create a fresh request.
          </span>
        )}
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
