"use client";

import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import {
  applyLibraryReleaseAction,
  planLibraryReleaseAction,
} from "@/lib/actions/libraryCleanup";
import type { ReleasePlan } from "@/lib/libraryReconcile";

/**
 * Dry run by default: the plan is on screen before anything is touched, and the
 * apply only sends back the ids that were listed.
 */
export function CleanupClient({ initialPlan }: { initialPlan: ReleasePlan }) {
  const router = useRouter();
  const toast = useToast();
  const [plan, setPlan] = useState(initialPlan);
  const [includeManual, setIncludeManual] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const reload = (next: boolean) => {
    setIncludeManual(next);
    setConfirming(false);
    startTransition(async () => {
      const res = await planLibraryReleaseAction(next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPlan(res.plan);
    });
  };

  const apply = () => {
    startTransition(async () => {
      const res = await applyLibraryReleaseAction(
        plan.candidates.map((c) => c.downloadedTrackId),
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Released ${res.released} track${res.released === 1 ? "" : "s"}; ${res.filesDeleted} file${res.filesDeleted === 1 ? "" : "s"} deleted.`,
      );
      setConfirming(false);
      const fresh = await planLibraryReleaseAction(includeManual);
      if (fresh.ok) setPlan(fresh.plan);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="In your library" value={plan.totalInLibrary} />
        <Stat label="Kept — liked" value={plan.keptLiked} />
        <Stat label="Kept — in your playlists" value={plan.keptInOwnPlaylist} />
        <Stat
          label="Kept — auto-download playlist"
          value={plan.keptInSubscribedPlaylist}
        />
      </dl>

      <label className="flex items-start gap-3 rounded-2xl border border-foreground/10 bg-card p-4 text-sm">
        <input
          type="checkbox"
          checked={includeManual}
          onChange={(e) => reload(e.target.checked)}
          disabled={pending}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--pastel-pink)]"
        />
        <span>
          <span className="font-bold">
            Include tracks with unknown origin ({plan.keptManual} held back)
          </span>
          <span className="mt-1 block text-muted-foreground">
            Downloads only started recording where they came from recently.
            Everything older reads as &ldquo;you asked for it&rdquo;, which is
            the safe assumption — but it also hides the playlist picks that piled
            up before then. Tick this to fall back to &ldquo;nothing points at
            this any more&rdquo;, and read the list before you act on it.
          </span>
        </span>
      </label>

      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Would be released — {plan.candidates.length}
          {plan.filesToDelete > 0 && (
            <span className="ml-2 normal-case text-pastel-red">
              {plan.filesToDelete} file{plan.filesToDelete === 1 ? "" : "s"}{" "}
              deleted from disk
            </span>
          )}
        </h2>

        {plan.candidates.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-foreground/15 bg-card p-6 text-center text-sm text-muted-foreground">
            Nothing to release — every track is accounted for.
          </p>
        ) : (
          <ol className="max-h-[28rem] divide-y divide-border/50 overflow-y-auto rounded-2xl border border-foreground/10 bg-card">
            {plan.candidates.map((c) => (
              <li
                key={c.downloadedTrackId}
                className="flex items-center gap-3 px-4 py-2.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate">{c.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.artistName}
                    {c.albumTitle ? ` · ${c.albumTitle}` : ""}
                  </p>
                </div>
                {c.wouldDeleteFile && (
                  <span
                    className="shrink-0 rounded-full bg-pastel-red px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink"
                    title="No one else has this track — the file goes too"
                  >
                    File
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {plan.candidates.length > 0 && (
        <div className="rounded-2xl border-2 border-pastel-red/40 bg-card p-4">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-pastel-red" />
            <span>
              This removes {plan.candidates.length} track
              {plan.candidates.length === 1 ? "" : "s"} from your library and
              permanently deletes {plan.filesToDelete} file
              {plan.filesToDelete === 1 ? "" : "s"}. It can&apos;t be undone.
            </span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {confirming ? (
              <>
                <Button
                  onClick={apply}
                  disabled={pending}
                  className="gap-2 bg-pastel-red text-ink hover:bg-pastel-red/80"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Yes, release {plan.candidates.length}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setConfirming(true)}
                disabled={pending}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Release these
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}
