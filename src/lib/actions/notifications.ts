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
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    requestId: n.requestId,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));
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
