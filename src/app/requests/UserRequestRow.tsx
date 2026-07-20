"use client";

import { Clock, Disc3, Music2, Search } from "lucide-react";
import Link from "next/link";
import type { RequestRowData } from "@/app/admin/requests/AdminRequestRow";
import { DownloadProgressBar } from "@/components/DownloadProgressBar";
import { StatusBadge } from "@/components/StatusBadge";
import { UnrequestButton } from "./UnrequestButton";

// One row in the user's Requests/Downloads lists (mirrors AdminRequestRow,
// minus the requester name and approve/decline actions, plus unrequest).
export function UserRequestRow({ request: r }: { request: RequestRowData }) {
  const href =
    r.type === "TRACK" && r.albumMbid
      ? `/album/${r.albumMbid}`
      : `/album/${r.mbid}`;
  const kind = r.type.toLowerCase();

  return (
    <li className="flex items-center gap-4 py-3">
      <Link
        href={href}
        className="flex h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-secondary"
      >
        {r.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.coverUrl}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            {r.type === "TRACK" ? (
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
          title={r.title}
        >
          {r.title}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {r.type === "TRACK" && r.albumTitle
            ? `${r.artistName} · ${r.albumTitle}`
            : r.artistName}{" "}
          · {kind} requested {formatRelative(new Date(r.requestedAt))}
        </p>
        {r.status === "APPROVED" &&
          (r.lastSearchedAt ? (
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              Waiting ·{" "}
              {r.declineReason ?? "Will scan Soulseek again soon."}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 truncate text-xs text-pastel-sky">
              <Search className="h-3 w-3 shrink-0 animate-pulse" />
              Scanning Soulseek for a match…
            </p>
          ))}
        {r.downloadTitle && r.status !== "APPROVED" && (
          <p className="truncate text-xs text-muted-foreground">
            Download: {r.downloadTitle}
          </p>
        )}
        {(r.status === "DECLINED" || r.status === "FAILED") &&
          r.declineReason && (
            <p className="truncate text-xs text-muted-foreground">
              {r.status === "FAILED" ? "Failure" : "Reason"}: {r.declineReason}
            </p>
          )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <StatusBadge status={r.status} />
        {r.status === "DOWNLOADING" && <DownloadProgressBar requestId={r.id} />}
        <UnrequestButton
          request={{
            id: r.id,
            type: r.type,
            mbid: r.mbid,
            albumMbid: r.albumMbid,
          }}
        />
      </div>
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
