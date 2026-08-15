"use client";

import {
  CheckCircle2,
  Disc3,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RelativeTime } from "@/app/import/spotify/[playlistId]/RelativeTime";
import { markRead } from "@/lib/actions/notifications";
import type { NotificationItem } from "@/lib/actions/notifications";
import type { NotificationType } from "@prisma/client";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<
  NotificationType,
  { Icon: typeof CheckCircle2; className: string; label: string }
> = {
  REQUEST_APPROVED: {
    Icon: CheckCircle2,
    className: "bg-pastel-mint text-ink",
    label: "Approved",
  },
  REQUEST_DECLINED: {
    Icon: XCircle,
    className: "bg-pastel-lavender text-ink",
    label: "Declined",
  },
  REQUEST_AVAILABLE: {
    Icon: Disc3,
    className: "bg-pastel-sky text-ink",
    label: "Available",
  },
  REQUEST_FAILED: {
    Icon: TriangleAlert,
    className: "bg-pastel-red text-ink",
    label: "Failed",
  },
};

/**
 * One notification row. Clicking marks it read (optimistically) and follows
 * the deep link to /requests, where the request that triggered it lives.
 */
export function NotificationRow({ item }: { item: NotificationItem }) {
  const [read, setRead] = useState(item.readAt !== null);
  const [coverBroken, setCoverBroken] = useState(false);
  const { Icon, className, label } = TYPE_ICON[item.type];
  const showCover = Boolean(item.coverUrl) && !coverBroken;

  return (
    <li>
      <Link
        href="/requests"
        onClick={() => {
          if (!read) {
            setRead(true);
            void markRead(item.id).catch(() => {});
          }
        }}
        className={cn(
          "flex items-start gap-4 px-2 py-4 transition-colors hover:bg-surface-2/60 rounded-xl",
          !read && "font-medium",
        )}
      >
        {/*
          Square artwork tile, sized and rounded like the cover on a
          /requests row so the two pages read as one app. `rounded-xl` is a
          22px radius here, which would turn a tile this small into a circle.
          The status icon rides in the corner, so approved / declined /
          available / failed still reads at a glance.
        */}
        <span className="relative mt-0.5 size-12 shrink-0">
          {showCover ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.coverUrl ?? ""}
                alt=""
                className="size-12 rounded-lg bg-secondary object-cover"
                referrerPolicy="no-referrer"
                onError={() => setCoverBroken(true)}
              />
              <span
                className={cn(
                  "absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full ring-2 ring-background",
                  className,
                )}
                title={label}
              >
                <Icon className="h-3 w-3" />
              </span>
            </>
          ) : (
            <span
              className={cn(
                "flex size-12 items-center justify-center rounded-lg",
                className,
              )}
              title={label}
            >
              <Icon className="h-5 w-5" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate">{item.title}</span>
            {!read && (
              <span
                aria-label="Unread"
                className="size-2 shrink-0 rounded-full bg-pastel-pink"
              />
            )}
          </span>
          {item.body && (
            <span className="mt-0.5 block truncate text-sm font-normal text-muted-foreground">
              {item.body}
            </span>
          )}
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            <RelativeTime date={new Date(item.createdAt)} />
          </span>
        </span>
      </Link>
    </li>
  );
}
