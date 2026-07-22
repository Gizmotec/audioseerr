// In-app notifications (bell + /notifications page) and the global outbound
// webhook (design doc §8). A notification is created at every request-status
// transition (approved / declined / available / failed); if the admin has set
// Settings.notificationWebhookUrl, the same event is also POSTed there as JSON
// so users can self-wire Discord / ntfy / Gotify without per-service
// integrations.
//
// Everything here is best-effort: notifications are a side concern of the
// request lifecycle, so neither the DB insert nor the webhook delivery ever
// throws into the caller's flow.

import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import type {
  NotificationType,
  RequestStatus,
  RequestType,
} from "@prisma/client";

const WEBHOOK_TIMEOUT_MS = 4000;

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  requestId?: string | null;
};

/** The request slice the webhook payload carries (and the copy builder needs). */
export type WebhookRequestShape = {
  id: string;
  type: RequestType;
  title: string;
  artistName: string;
  albumTitle?: string | null;
  status: RequestStatus;
};

export type WebhookPayload = {
  event: NotificationType;
  request: {
    id: string;
    type: RequestType;
    title: string;
    artistName: string;
    albumTitle: string | null;
    status: RequestStatus;
  } | null;
  user: { id: string; username: string } | null;
  timestamp: string;
};

/**
 * Pure payload builder for the outbound webhook, exported for unit tests.
 * `timestamp` is injectable so tests get deterministic output.
 */
export function buildWebhookPayload(input: {
  type: NotificationType;
  request?: WebhookRequestShape | null;
  user?: { id: string; username: string } | null;
  timestamp?: Date;
}): WebhookPayload {
  return {
    event: input.type,
    request: input.request
      ? {
          id: input.request.id,
          type: input.request.type,
          title: input.request.title,
          artistName: input.request.artistName,
          albumTitle: input.request.albumTitle ?? null,
          status: input.request.status,
        }
      : null,
    user: input.user
      ? { id: input.user.id, username: input.user.username }
      : null,
    timestamp: (input.timestamp ?? new Date()).toISOString(),
  };
}

type CopyRequestShape = {
  type: RequestType;
  title: string;
  artistName: string;
  albumTitle?: string | null;
};

function describeRequest(request: CopyRequestShape): string {
  if (request.type === "TRACK") {
    return request.albumTitle
      ? `"${request.title}" by ${request.artistName} (${request.albumTitle})`
      : `"${request.title}" by ${request.artistName}`;
  }
  if (request.type === "ALBUM") {
    return `${request.title} by ${request.artistName}`;
  }
  return request.artistName;
}

/**
 * Pure title/body copy for a request-transition notification, exported for
 * unit tests. `reason` is the decline/failure reason, when there is one.
 */
export function buildNotificationCopy(
  type: NotificationType,
  request: CopyRequestShape,
  reason?: string | null,
): { title: string; body: string } {
  const what = describeRequest(request);
  switch (type) {
    case "REQUEST_APPROVED":
      return { title: "Your request was approved", body: what };
    case "REQUEST_DECLINED":
      return {
        title: "Your request was declined",
        body: reason ? `${what} — Reason: ${reason}` : what,
      };
    case "REQUEST_AVAILABLE":
      return {
        title:
          request.type === "TRACK"
            ? "Your track is ready to play"
            : "Your request is ready to play",
        body: what,
      };
    case "REQUEST_FAILED":
      return {
        title: "Your request failed",
        body: reason ? `${what} — ${reason}` : what,
      };
  }
}

/**
 * Insert the notification row, then fire the global webhook fire-and-forget.
 * Never throws: a notification failure must not break the request flow that
 * triggered it.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        requestId: input.requestId ?? null,
      },
    });
  } catch (err) {
    console.warn(
      "[notifications] failed to insert notification:",
      err instanceof Error ? err.message : err,
    );
    return;
  }
  // Deliberately not awaited — delivery must never block the caller.
  void fireWebhook(input);
}

/**
 * Convenience wrapper for the request-lifecycle call sites: builds the
 * title/body copy and notifies the requester. `request` needs the fields the
 * copy and webhook payload carry; pass the row you already have.
 */
export async function notifyRequestTransition(
  request: CopyRequestShape & { id: string; requestedById: string },
  type: NotificationType,
  opts: { reason?: string | null } = {},
): Promise<void> {
  const { title, body } = buildNotificationCopy(type, request, opts.reason);
  await createNotification({
    userId: request.requestedById,
    type,
    title,
    body,
    requestId: request.id,
  });
}

async function fireWebhook(input: CreateNotificationInput): Promise<void> {
  try {
    const settings = await getSettings();
    const url = settings.notificationWebhookUrl;
    if (!url) return;

    const [request, user] = await Promise.all([
      input.requestId
        ? prisma.request.findUnique({
            where: { id: input.requestId },
            select: {
              id: true,
              type: true,
              title: true,
              artistName: true,
              albumTitle: true,
              status: true,
            },
          })
        : null,
      prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, username: true },
      }),
    ]);

    const payload = buildWebhookPayload({ type: input.type, request, user });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn(
      "[notifications] webhook delivery failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
