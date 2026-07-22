"use client";

import { Check, Clock, Disc3, Loader2, Music2, Search, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DownloadProgressBar } from "@/components/DownloadProgressBar";
import { StatusBadge } from "@/components/StatusBadge";
import type { RequestStatus, RequestType } from "@prisma/client";
import { approveRequestAction, declineRequestAction } from "./actions";

export type RequestRowData = {
  id: string;
  type: RequestType;
  mbid: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
  albumMbid: string | null;
  albumTitle: string | null;
  downloadTitle: string | null;
  status: RequestStatus;
  declineReason: string | null;
  requestedBy: string | null;
  requestedAt: string;
  lastSearchedAt: string | null;
};

export function AdminRequestRow({
  request,
  isPending,
}: {
  request: RequestRowData;
  isPending: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<RequestStatus | null>(null);

  const status = done ?? request.status;
  const canRetry = status === "FAILED" && !done;
  const canAct = isPending || canRetry;
  const href = request.type === "TRACK" && request.albumMbid
    ? `/album/${request.albumMbid}`
    : `/album/${request.mbid}`;
  const requestKind = request.type.toLowerCase();

  const approve = () => {
    setError(null);
    startTransition(async () => {
      const r = await approveRequestAction(request.id);
      if (r.ok) setDone(request.type === "TRACK" ? "DOWNLOADING" : "APPROVED");
      else setError(r.error);
    });
  };

  const decline = () => {
    setError(null);
    startTransition(async () => {
      const r = await declineRequestAction(request.id, reason);
      if (r.ok) {
        setDone("DECLINED");
        setDeclineOpen(false);
      } else {
        setError(r.error);
      }
    });
  };

  return (
    <li className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:gap-4">
      <Link
        href={href}
        className="flex h-14 w-14 shrink-0 overflow-hidden rounded bg-secondary"
      >
        {request.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={request.coverUrl}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            {request.type === "TRACK" ? (
              <Music2 className="h-6 w-6" />
            ) : (
              <Disc3 className="h-6 w-6" />
            )}
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="block truncate font-medium hover:underline"
        >
          {request.title}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {request.type === "TRACK" && request.albumTitle
            ? `${request.artistName} · ${request.albumTitle}`
            : request.artistName}{" "}
          · {requestKind}
          {request.requestedBy ? (
            <>
              {" "}
              requested by{" "}
              <span className="font-mono">{request.requestedBy}</span>
            </>
          ) : null}{" "}
          · {formatRelative(new Date(request.requestedAt))}
        </p>
        {request.downloadTitle && status !== "APPROVED" && (
          <p className="truncate text-xs text-muted-foreground">
            Download: {request.downloadTitle}
          </p>
        )}
        {!isPending &&
          status === "APPROVED" &&
          (request.lastSearchedAt ? (
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              Waiting ·{" "}
              {request.declineReason ?? "Will scan Soulseek again soon."} ·
              scanned {formatRelative(new Date(request.lastSearchedAt))}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 truncate text-xs text-pastel-sky">
              <Search className="h-3 w-3 shrink-0 animate-pulse" />
              Scanning Soulseek for a match…
            </p>
          ))}
        {!isPending &&
          (status === "DECLINED" || status === "FAILED") &&
          request.declineReason && (
          <p className="truncate text-xs text-muted-foreground">
            {status === "FAILED" ? "Failure" : "Reason"}:{" "}
            {request.declineReason}
          </p>
        )}
      </div>

      {canAct && !done ? (
        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={approve}
              disabled={pending}
              className="gap-1.5"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {canRetry ? "Retry" : "Approve"}
            </Button>
            {isPending && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeclineOpen((v) => !v)}
                disabled={pending}
                className="gap-1.5"
              >
                <X className="h-4 w-4" /> Decline
              </Button>
            )}
          </div>
          {declineOpen && (
            <div className="flex w-full flex-col gap-2 md:max-w-sm">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (shown to the requester)"
                disabled={pending}
              />
              <div className="flex gap-2 md:justify-end">
                <Button size="sm" variant="ghost" onClick={() => setDeclineOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={decline}
                  disabled={pending}
                >
                  Confirm decline
                </Button>
              </div>
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : status === "DOWNLOADING" ? (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={status} />
          <DownloadProgressBar requestId={request.id} />
        </div>
      ) : (
        <StatusBadge status={status} />
      )}
    </li>
  );
}

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString();
}
