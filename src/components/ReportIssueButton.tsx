"use client";

import { Check, Flag, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { reportIssueAction } from "@/lib/actions/issues";
import {
  ISSUE_DESCRIPTION_MAX,
  ISSUE_TITLE_MAX,
  ISSUE_TYPE_LABELS,
  ISSUE_TYPES,
  type IssueTypeValue,
} from "@/lib/issues";
import { cn } from "@/lib/utils";

export type ReportIssueContextProps = {
  artistName: string;
  albumTitle?: string | null;
  albumMbid?: string | null;
  /** Recording MBID when known, else `${albumMbid}:${absolutePosition}`. */
  trackKey?: string | null;
  /** Display-only, for the modal header — the track the user clicked on. */
  trackTitle?: string | null;
};

type Props = {
  context: ReportIssueContextProps;
  /** Compact icon-only button used inside dense track rows. */
  variant?: "icon" | "default";
};

/**
 * "Report a problem" affordance (album-level in the hero actions, track-level
 * in each row). Opens a modal — same shell as the lyrics/YouTube modals —
 * with a type picker, title, and description, filed via reportIssueAction.
 */
export function ReportIssueButton({ context, variant = "icon" }: Props) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  const subject = context.trackTitle ?? context.albumTitle ?? context.artistName;
  const ariaLabel = context.trackTitle
    ? `Report a problem with "${context.trackTitle}"`
    : context.albumTitle
      ? `Report a problem with "${context.albumTitle}"`
      : "Report a problem";

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={ariaLabel}
        title="Report a problem"
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
          variant === "icon" ? "h-8 w-8" : "h-9 gap-1.5 px-3 text-sm",
        )}
      >
        <Flag className="h-4 w-4" />
        {variant === "default" && <span>Report a problem</span>}
      </button>
      {open && (
        <ReportIssueModal
          context={context}
          subject={subject}
          onClose={close}
        />
      )}
    </>
  );
}

function ReportIssueModal({
  context,
  subject,
  onClose,
}: {
  context: ReportIssueContextProps;
  subject: string;
  onClose: () => void;
}) {
  const [type, setType] = useState<IssueTypeValue>("WRONG_MATCH");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  // ESC to close, matching the lyrics/YouTube modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await reportIssueAction({
        type,
        title,
        description,
        context: {
          artistName: context.artistName,
          albumTitle: context.albumTitle ?? null,
          albumMbid: context.albumMbid ?? null,
          trackKey: context.trackKey ?? null,
        },
      });
      if (result.ok) setDone(true);
      else setError(result.error);
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Report a problem: ${subject}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[80vh] w-full max-w-lg flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={subject}>
              Report a problem
            </p>
            <p
              className="truncate text-xs text-muted-foreground"
              title={`${context.artistName}${context.albumTitle ? ` · ${context.albumTitle}` : ""}`}
            >
              {subject}
              {context.trackTitle ? ` · ${context.artistName}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report dialog"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto rounded-xl border border-foreground/10 bg-surface p-6">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-pastel-mint text-ink">
                <Check className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium">Report sent — thanks!</p>
              <p className="text-xs text-muted-foreground">
                The admin will take a look. Track its status under My reports.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 inline-flex h-9 items-center justify-center rounded-full bg-pastel-pink px-4 text-sm font-bold text-ink transition-colors hover:bg-pastel-pink/80"
              >
                Done
              </button>
            </div>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="issue-type"
                  className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Problem type
                </label>
                <select
                  id="issue-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as IssueTypeValue)}
                  disabled={pending}
                  className="h-10 w-full rounded-xl border-2 border-transparent bg-surface-2 px-3.5 text-sm outline-none focus-visible:border-primary disabled:opacity-50"
                >
                  {ISSUE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ISSUE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="issue-title"
                  className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Title
                </label>
                <input
                  id="issue-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={ISSUE_TITLE_MAX}
                  placeholder="What's wrong?"
                  disabled={pending}
                  required
                  className="h-10 w-full min-w-0 rounded-xl border-2 border-transparent bg-surface-2 px-3.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="issue-description"
                  className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Description <span className="font-normal">(optional)</span>
                </label>
                <textarea
                  id="issue-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={ISSUE_DESCRIPTION_MAX}
                  placeholder="Details that help the admin reproduce or fix it…"
                  disabled={pending}
                  rows={4}
                  className="min-h-24 w-full min-w-0 resize-y rounded-xl border-2 border-transparent bg-surface-2 px-3.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary disabled:opacity-50"
                />
              </div>

              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={pending}
                  className="inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || title.trim().length === 0}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-pastel-pink px-4 text-sm font-bold text-ink transition-colors hover:bg-pastel-pink/80 disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Flag className="h-4 w-4" />
                  )}
                  Submit report
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
