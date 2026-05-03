import type { RequestStatus } from "@prisma/client";

const STYLES: Record<RequestStatus, string> = {
  PENDING: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  APPROVED: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  DOWNLOADING: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  AVAILABLE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  DECLINED: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  FAILED: "bg-destructive/15 text-destructive border-destructive/30",
};

const LABELS: Record<RequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DOWNLOADING: "Downloading",
  AVAILABLE: "Available",
  DECLINED: "Declined",
  FAILED: "Failed",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
