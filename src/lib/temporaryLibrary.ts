export type LibraryTab = "library" | "temporary";

export function parseLibraryTab(
  value: string | string[] | undefined,
): LibraryTab {
  return value === "temporary" ? "temporary" : "library";
}

export function formatTemporaryExpiryCaption(
  expiresAt: Date | null,
  now: Date,
  timeZone?: string,
): string {
  if (!expiresAt || !Number.isFinite(expiresAt.getTime())) {
    return "Expiry unavailable";
  }

  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(expiresAt);

  return `${expiresAt.getTime() <= now.getTime() ? "Expired" : "Expires"} ${formatted}`;
}
