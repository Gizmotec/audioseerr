"use client";

import { Check, Flag, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  closeIssueAction,
  resolveIssueAction,
} from "@/lib/actions/issues";
import {
  ISSUE_RESOLVER_NOTE_MAX,
  issueStatusBadgeVariant,
  issueStatusLabel,
  issueTypeLabel,
  type IssueStatusValue,
  type IssueTypeValue,
} from "@/lib/issues";

export type AdminIssueRowData = {
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
  reporter: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export function AdminIssueRow({ issue }: { issue: AdminIssueRowData }) {
  const [pending, startTransition] = useTransition();
  const [noteOpen, setNoteOpen] = useState<"RESOLVED" | "CLOSED" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<IssueStatusValue | null>(null);

  const status = done ?? issue.status;
  const canAct = status === "OPEN" && !done;

  const act = (target: "RESOLVED" | "CLOSED") => {
    setError(null);
    startTransition(async () => {
      const action =
        target === "RESOLVED" ? resolveIssueAction : closeIssueAction;
      const r = await action(issue.id, note);
      if (r.ok) {
        setDone(target);
        setNoteOpen(null);
      } else {
        setError(r.error);
      }
    });
  };

  const context = [issue.artistName, issue.albumTitle]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {issue.albumMbid ? (
            <Link
              href={`/album/${issue.albumMbid}`}
              className="truncate font-medium hover:underline"
              title={issue.title}
            >
              {issue.title}
            </Link>
          ) : (
            <span className="truncate font-medium" title={issue.title}>
              {issue.title}
            </span>
          )}
          <Badge variant="secondary">{issueTypeLabel(issue.type)}</Badge>
          <Badge variant={issueStatusBadgeVariant(status)}>
            {issueStatusLabel(status)}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          <Flag className="mr-1 inline h-3 w-3 align-[-1px]" />
          {context} · {issue.trackKey ? "track" : "album"}-level
          {issue.reporter ? (
            <>
              {" "}
              · reported by <span className="font-mono">{issue.reporter}</span>
            </>
          ) : null}{" "}
          · {formatRelative(new Date(issue.createdAt))}
        </p>
        {issue.trackKey && (
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground/70">
            track: {issue.trackKey}
          </p>
        )}
        {issue.description && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {issue.description}
          </p>
        )}
        {issue.resolverNote && status !== "OPEN" && (
          <p className="mt-1 text-sm">
            <span className="font-medium">Note:</span> {issue.resolverNote}
          </p>
        )}
      </div>

      {canAct && (
        <div className="flex shrink-0 flex-col gap-2 md:items-end">
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() =>
                setNoteOpen((v) => (v === "RESOLVED" ? null : "RESOLVED"))
              }
              disabled={pending}
              className="gap-1.5"
            >
              <Check className="h-4 w-4" /> Resolve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setNoteOpen((v) => (v === "CLOSED" ? null : "CLOSED"))
              }
              disabled={pending}
              className="gap-1.5"
            >
              <X className="h-4 w-4" /> Close
            </Button>
          </div>
          {noteOpen && (
            <div className="flex w-full flex-col gap-2 md:max-w-sm">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={ISSUE_RESOLVER_NOTE_MAX}
                placeholder="Note for the reporter (optional)"
                disabled={pending}
              />
              <div className="flex gap-2 md:justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setNoteOpen(null)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant={noteOpen === "CLOSED" ? "destructive" : "default"}
                  onClick={() => act(noteOpen)}
                  disabled={pending}
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Confirm {noteOpen === "CLOSED" ? "close" : "resolve"}
                </Button>
              </div>
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString();
}
