"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getUnreadCount } from "@/lib/actions/notifications";

const POLL_MS = 60_000;

/**
 * Bell in the sidebar header with an unread-count badge, linking to
 * /notifications. The count comes from the server at render (initialCount)
 * and is refreshed on a light 60s poll — skipped while the tab is hidden,
 * matching the download-progress poller's behaviour.
 */
export function NotificationBell({
  initialCount = 0,
}: {
  initialCount?: number;
}) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const next = await getUnreadCount();
        if (!cancelled) setCount(next);
      } catch {
        // Keep the last-known count; try again next tick.
      }
    };
    const id = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <Link
      href="/notifications"
      aria-label={
        count > 0 ? `Notifications (${count} unread)` : "Notifications"
      }
      title="Notifications"
      className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-pastel-pink px-1 text-[10px] leading-none font-extrabold text-ink"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
