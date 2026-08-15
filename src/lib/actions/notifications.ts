"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { NotificationType } from "@prisma/client";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  requestId: string | null;
  /** Artwork of the request that triggered this, when it still exists. */
  coverUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function getUnreadCount(): Promise<number> {
  const userId = await requireUserId();
  if (!userId) return 0;
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(): Promise<NotificationItem[]> {
  const userId = await requireUserId();
  if (!userId) return [];
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Notification.requestId has no Prisma relation, so the artwork is joined in
  // a second query. Scoped to this user's own requests; an unrequested (deleted)
  // request simply leaves the row without a cover.
  const requestIds = [
    ...new Set(rows.map((n) => n.requestId).filter((id): id is string => !!id)),
  ];
  const requests = requestIds.length
    ? await prisma.request.findMany({
        where: { id: { in: requestIds }, requestedById: userId },
        select: { id: true, coverUrl: true },
      })
    : [];
  const byId = new Map(requests.map((r) => [r.id, r]));

  return rows.map((n) => {
    const request = n.requestId ? byId.get(n.requestId) : undefined;
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      requestId: n.requestId,
      coverUrl: request?.coverUrl ?? null,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    };
  });
}

export async function markRead(id: string): Promise<void> {
  const userId = await requireUserId();
  if (!userId) return;
  // updateMany scoped by userId so one user can't mark another's row.
  await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

export async function markAllRead(): Promise<void> {
  const userId = await requireUserId();
  if (!userId) return;
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}
