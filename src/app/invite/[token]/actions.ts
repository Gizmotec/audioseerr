"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";

const schema = z.object({
  token: z.string().min(1),
  username: z.string().min(2).max(64),
  email: z.string().email(),
  password: z.string().min(8),
});

type ActionResult =
  | { ok: true; username: string; password: string }
  | { ok: false; error: string };

// Public (unauthenticated) action — invitee submits username/email/password
// against a known token. The shared password is echoed back so the client can
// pass it straight into next-auth's signIn() without re-prompting.
export async function redeemInviteAction(raw: unknown): Promise<ActionResult> {
  if (!(await isSetupComplete())) {
    return { ok: false, error: "Setup is incomplete." };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { token, username, email, password } = parsed.data;

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.usedAt) return { ok: false, error: "This invite has already been used." };
  if (invite.expiresAt < new Date()) {
    return { ok: false, error: "This invite has expired." };
  }

  const [usernameTaken, emailTaken] = await Promise.all([
    prisma.user.findUnique({ where: { username } }),
    prisma.user.findUnique({ where: { email } }),
  ]);
  if (usernameTaken) return { ok: false, error: "Username already in use." };
  if (emailTaken) return { ok: false, error: "Email already in use." };

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          email,
          passwordHash,
          role: "USER",
        },
      });
      // Atomic claim: only succeeds if the invite is still unused. If two
      // browsers race this action with the same token, exactly one claim
      // updates a row and the other throws CLAIM_LOST.
      const claim = await tx.invite.updateMany({
        where: { token, usedAt: null },
        data: { usedAt: new Date(), usedById: user.id },
      });
      if (claim.count === 0) {
        throw new Error("CLAIM_LOST");
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === "CLAIM_LOST") {
      return { ok: false, error: "This invite has already been used." };
    }
    return { ok: false, error: "Could not create your account." };
  }

  return { ok: true, username, password };
}
