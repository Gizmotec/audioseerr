"use client";

import { CheckCircle2, Loader2, UserPlus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { unrequestAction } from "@/lib/actions/requests";
import { requestArtistAction } from "./actions";

export type ExistingArtistRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "DOWNLOADING"
  | "AVAILABLE"
  | "DECLINED"
  | "FAILED";

type Props = {
  artist: {
    mbid: string;
    name: string;
    imageUrl: string | null;
  };
  existingStatus: ExistingArtistRequestStatus | null;
};

const ACTIVE_LABEL: Record<ExistingArtistRequestStatus, string> = {
  PENDING: "Artist request pending",
  APPROVED: "Artist request approved",
  DOWNLOADING: "Downloading discography",
  AVAILABLE: "Discography available",
  DECLINED: "Declined",
  FAILED: "Failed",
};

export function RequestArtistButton({ artist, existingStatus }: Props) {
  const [pending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] =
    useState<ExistingArtistRequestStatus | null>(existingStatus);
  const [error, setError] = useState<string | null>(null);

  const blocking =
    optimisticStatus === "PENDING" ||
    optimisticStatus === "APPROVED" ||
    optimisticStatus === "DOWNLOADING" ||
    optimisticStatus === "AVAILABLE";

  if (blocking) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-pastel-mint" />
          <span className="text-muted-foreground">
            {ACTIVE_LABEL[optimisticStatus!]}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await unrequestAction({
                  type: "ARTIST",
                  mbid: artist.mbid,
                });
                if (result.ok) setOptimisticStatus(null);
                else setError(result.error);
              });
            }}
            className="gap-1.5"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            Unrequest
          </Button>
        </div>
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await requestArtistAction(artist);
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
            <UserPlus className="h-4 w-4" />
          )}
          {pending ? "Submitting…" : "Request artist"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Adds the full discography to Lidarr.
        </span>
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
