"use client";

import { useSyncExternalStore } from "react";

// Re-render once a minute so relative labels ("5 minutes ago") stay fresh
// while the page sits open.
function subscribeToMinute(onStoreChange: () => void) {
  const id = setInterval(onStoreChange, 60_000);
  return () => clearInterval(id);
}

export function RelativeTime({ date }: { date: Date }) {
  // Date.now() is impure, so it can't be called during render. The external
  // store pattern gives us a hydration-safe server snapshot (null → absolute
  // date) and live relative times on the client.
  const now = useSyncExternalStore(subscribeToMinute, () => Date.now(), () => null);
  const time = new Date(date);

  if (now === null) {
    return (
      <time dateTime={time.toISOString()}>{time.toLocaleDateString()}</time>
    );
  }

  const ms = now - time.getTime();
  const minutes = Math.round(ms / 60000);
  const hours = Math.round(ms / 3_600_000);
  const days = Math.round(ms / 86_400_000);
  let text: string;
  if (minutes < 1) text = "just now";
  else if (minutes < 60) text = `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  else if (hours < 24) text = `${hours} hour${hours === 1 ? "" : "s"} ago`;
  else if (days < 30) text = `${days} day${days === 1 ? "" : "s"} ago`;
  else text = time.toLocaleDateString();
  return <time dateTime={time.toISOString()}>{text}</time>;
}
