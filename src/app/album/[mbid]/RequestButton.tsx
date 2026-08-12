"use client";

import { Check, Disc3, Loader2, PlusCircle, X } from "lucide-react";
import { useCallback, useState, useTransition } from "react";
import { DownloadRing, useDownloadState } from "@/components/DownloadIndicator";
import { Button } from "@/components/ui/button";
import { unrequestAction } from "@/lib/actions/requests";
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

export function RequestButton({ album, existingStatus, libraryStatus }: Props) {
  const [pending, startTransition] = useTransition();
  const [unrequested, setUnrequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = unrequested ? null : existingStatus;
  const owned = status === "AVAILABLE" || libraryStatus === "downloaded";
  const active =
    status === "PENDING" || status === "APPROVED" || status === "DOWNLOADING";

  const submit = useCallback(() => requestAlbumAction(album), [album]);
  const download = useDownloadState({
    trackKey: album.mbid,
    owned,
    active,
    noun: "album",
    submit,
  });

  const { reset } = download;
  const unrequest = () => {
    setError(null);
    reset();
    startTransition(async () => {
      const result = await unrequestAction({ type: "ALBUM", mbid: album.mbid });
      if (result.ok) setUnrequested(true);
      else setError(result.error);
    });
  };

  // A live transfer replaces the label with real progress, so "Approved" no
  // longer reads as "downloaded" while nothing has actually transferred.
  if (download.busy || download.phase === "complete") {
    const finished = download.phase === "complete";
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="relative inline-flex h-7 w-7 items-center justify-center">
            {finished ? (
              <>
                <DownloadRing percent={100} tone="mint" />
                <Check
                  className="h-3.5 w-3.5 text-pastel-mint"
                  strokeWidth={3}
                  data-dl-anim=""
                  style={{
                    animation: "dl-pop 420ms cubic-bezier(.2,.9,.3,1.2) both",
                  }}
                />
              </>
            ) : (
              <>
                <DownloadRing
                  percent={download.phase === "downloading" ? download.percent : null}
                  tone="pink"
                />
                <Disc3 className="h-3.5 w-3.5 text-pastel-pink" />
              </>
            )}
          </span>
          <span className="text-muted-foreground">{download.label}</span>
          {!finished && download.phase !== "starting" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={unrequest}
              className="gap-1.5"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              Cancel
            </Button>
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

  if (owned || download.phase === "owned") {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Check className="h-4 w-4 text-pastel-mint" strokeWidth={3} />
          <span className="text-muted-foreground">In your library</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={unrequest}
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

  // The user has no active request, but Lidarr already knows about this
  // album. Don't offer a redundant Request button.
  if (libraryStatus === "downloading") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Disc3 className="h-4 w-4 animate-pulse text-pastel-sky" />
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

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={download.start} className="gap-2">
          <PlusCircle className="h-4 w-4" />
          Download album
        </Button>
        {status === "DECLINED" && (
          <span className="text-xs text-muted-foreground">
            Previously declined — submitting will create a fresh request.
          </span>
        )}
      </div>
      {(error || download.error) && (
        <p className="text-xs text-destructive" role="alert">
          {error ?? download.error}
        </p>
      )}
    </div>
  );
}
