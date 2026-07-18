import type { RequestStatus } from "@prisma/client";

const STYLES: Record<RequestStatus, string> = {
  PENDING: "bg-pastel-yellow text-ink",
  APPROVED: "bg-pastel-sky text-ink",
  DOWNLOADING: "bg-pastel-sky text-ink",
  AVAILABLE: "bg-pastel-mint text-ink",
  DECLINED: "bg-surface-2 text-muted-foreground",
  FAILED: "bg-pastel-red text-ink",
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
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
