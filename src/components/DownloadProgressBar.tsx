"use client";

// A thin live progress bar for an in-flight (Downloading/Approved) request row.
// Reads from DownloadsProgressProvider; renders nothing for failed transfers
// (the row already shows the failure reason) and an indeterminate bar until
// slskd reports usable bytes.

import { useDownloadProgress } from "@/components/DownloadsProgressProvider";

export function DownloadProgressBar({ requestId }: { requestId: string }) {
  const progress = useDownloadProgress(requestId);

  if (progress?.state === "failed") return null;

  const done = progress?.state === "done";
  const percent = progress?.percent ?? null;
  const indeterminate = percent == null && !done;
  const value = done ? 100 : (percent ?? 0);
  const label = done ? "Finishing…" : percent == null ? "Starting…" : `${percent}%`;

  return (
    <div className="flex w-32 flex-col items-end gap-1">
      <span className="text-[11px] font-bold tabular-nums text-pastel-sky">{label}</span>
      <div
        className="h-2 w-full overflow-hidden rounded-full border border-ink bg-surface-2"
        role="progressbar"
        aria-label="Download progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : value}
      >
        {indeterminate ? (
          <div className="h-full w-2/5 animate-pulse rounded-full bg-pastel-sky" />
        ) : (
          <div
            className="h-full rounded-full bg-pastel-sky transition-all duration-500 ease-out"
            style={{ width: `${value}%` }}
          />
        )}
      </div>
    </div>
  );
}
