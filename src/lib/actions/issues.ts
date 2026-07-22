"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  sanitizeContextField,
  validateIssueInput,
  validateResolverNote,
  type IssueStatusValue,
  type IssueTypeValue,
} from "@/lib/issues";
import type { IssueStatus, IssueType } from "@prisma/client";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not signed in." };
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") return { ok: false, error: "Admin only." };
  return { ok: true };
}

/** Context the reporting page passes along — treated as display text only. */
export type ReportIssueContext = {
  artistName: string;
  albumTitle?: string | null;
  albumMbid?: string | null;
  trackKey?: string | null;
};

export type IssueListRow = {
  id: string;
  type: IssueTypeValue;
  status: IssueStatusValue;
  title: string;
  description: string | null;
  artistName: string;
  albumTitle: string | null;
  albumMbid: string | null;
  trackKey: string | null;
  resolverNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export async function reportIssueAction(input: {
  type: string;
  title: string;
  description?: string | null;
  context: ReportIssueContext;
}): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  const validated = validateIssueInput(input);
  if (!validated.ok) return validated;

  // Context comes from the page (ultimately MusicBrainz) but is still
  // client-supplied: store it as capped display text, never as trusted keys.
  const artistName = sanitizeContextField(input.context?.artistName);
  if (!artistName) {
    return { ok: false, error: "Missing artist context for this report." };
  }

  await prisma.issue.create({
    data: {
      reporterId: userId,
      type: validated.value.type as IssueType,
      title: validated.value.title,
      description: validated.value.description,
      artistName,
      albumTitle: sanitizeContextField(input.context?.albumTitle),
      albumMbid: sanitizeContextField(input.context?.albumMbid, 64),
      trackKey: sanitizeContextField(input.context?.trackKey, 128),
    },
  });

  revalidatePath("/issues");
  revalidatePath("/admin/issues");
  return { ok: true };
}

const MY_ISSUES_TAKE = 200;

export async function listMyIssuesAction(): Promise<
  { ok: true; issues: IssueListRow[] } | { ok: false; error: string }
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  const issues = await prisma.issue.findMany({
    where: { reporterId: userId },
    orderBy: { createdAt: "desc" },
    take: MY_ISSUES_TAKE,
  });

  return { ok: true, issues: issues.map(toRow) };
}

function toRow(i: {
  id: string;
  type: IssueType;
  status: IssueStatus;
  title: string;
  description: string | null;
  artistName: string;
  albumTitle: string | null;
  albumMbid: string | null;
  trackKey: string | null;
  resolverNote: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}): IssueListRow {
  return {
    id: i.id,
    type: i.type,
    status: i.status,
    title: i.title,
    description: i.description,
    artistName: i.artistName,
    albumTitle: i.albumTitle,
    albumMbid: i.albumMbid,
    trackKey: i.trackKey,
    resolverNote: i.resolverNote,
    createdAt: i.createdAt.toISOString(),
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
  };
}

async function transitionIssue(
  issueId: string,
  target: "RESOLVED" | "CLOSED",
  resolverNote: string | null | undefined,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const note = validateResolverNote(resolverNote);
  if (!note.ok) return note;

  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) return { ok: false, error: "Issue not found." };
  if (issue.status === target) {
    return { ok: false, error: `Already ${target.toLowerCase()}.` };
  }
  if (target === "RESOLVED" && issue.status !== "OPEN") {
    return { ok: false, error: "Only open issues can be resolved." };
  }

  await prisma.issue.update({
    where: { id: issue.id },
    data: {
      status: target,
      // Closing without a fresh note keeps whatever note resolve left behind.
      resolverNote: note.note ?? (target === "CLOSED" ? issue.resolverNote : null),
      resolvedAt: new Date(),
    },
  });

  revalidatePath("/admin/issues");
  revalidatePath("/issues");
  return { ok: true };
}

export async function resolveIssueAction(
  issueId: string,
  resolverNote?: string | null,
): Promise<ActionResult> {
  return transitionIssue(issueId, "RESOLVED", resolverNote);
}

export async function closeIssueAction(
  issueId: string,
  resolverNote?: string | null,
): Promise<ActionResult> {
  return transitionIssue(issueId, "CLOSED", resolverNote);
}
