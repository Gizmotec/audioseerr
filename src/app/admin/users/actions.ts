"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ActionResult = { ok: true } | { ok: false; error: string };
type ActionResultWith<T> = ({ ok: true } & T) | { ok: false; error: string };

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not signed in." };
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") return { ok: false, error: "Admin only." };
  const userId = (session.user as { id?: string }).id;
  if (!userId) return { ok: false, error: "Session missing user id." };
  return { ok: true, userId };
}

export async function createInviteAction(): Promise<
  ActionResultWith<{ token: string; expiresAt: string }>
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  // 24 random bytes → 32 url-safe characters. Plenty unguessable for a
  // single-server invite link with a 7-day TTL.
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await prisma.invite.create({
    data: {
      token,
      createdById: guard.userId,
      expiresAt,
    },
  });

  revalidatePath("/admin/users");
  return { ok: true, token, expiresAt: expiresAt.toISOString() };
}

export async function revokeInviteAction(token: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.usedAt) return { ok: false, error: "Invite already redeemed." };

  await prisma.invite.delete({ where: { token } });
  revalidatePath("/admin/users");
  return { ok: true };
}

export type AutoApproveType = "ARTIST" | "ALBUM" | "TRACK";

const AUTO_APPROVE_FIELDS: Record<AutoApproveType, "autoApproveArtist" | "autoApproveAlbum" | "autoApproveTrack"> = {
  ARTIST: "autoApproveArtist",
  ALBUM: "autoApproveAlbum",
  TRACK: "autoApproveTrack",
};

export async function setUserAutoApproveAction(
  userId: string,
  type: AutoApproveType,
  value: boolean,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const field = AUTO_APPROVE_FIELDS[type];
  if (!field) return { ok: false, error: "Bad type." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "User not found." };

  await prisma.user.update({
    where: { id: userId },
    data: { [field]: value },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (userId === guard.userId) {
    return { ok: false, error: "You can't delete your own account." };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "User not found." };

  // Last-admin guard. Even though admins can't self-delete, allow demoting
  // is out of scope for v1, so the only way to lose admin coverage is to
  // delete an ADMIN user while another ADMIN is signed in.
  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return { ok: false, error: "Can't delete the last admin." };
    }
  }

  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
  return { ok: true };
}
