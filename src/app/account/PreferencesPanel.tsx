"use client";

import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import {
  clearPlayHistoryAction,
  setPersonalizationEnabledAction,
} from "@/lib/actions/preferences";

export function PreferencesPanel({
  personalizationEnabled,
  playEventCount,
}: {
  personalizationEnabled: boolean;
  playEventCount: number;
}) {
  const [enabled, setEnabled] = useState(personalizationEnabled);
  const [eventCount, setEventCount] = useState(playEventCount);
  const [pendingToggle, startToggleTransition] = useTransition();
  const [pendingClear, startClearTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clearedJustNow, setClearedJustNow] = useState(false);

  const handleToggle = (next: boolean) => {
    setError(null);
    // Optimistic — flip the UI immediately, revert on error so the user
    // doesn't see a half-second of "did my click register?".
    setEnabled(next);
    startToggleTransition(async () => {
      const res = await setPersonalizationEnabledAction(next);
      if (!res.ok) {
        setEnabled(!next);
        setError(res.error);
      }
    });
  };

  const handleClear = () => {
    setError(null);
    setClearedJustNow(false);
    startClearTransition(async () => {
      const res = await clearPlayHistoryAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEventCount(0);
      setClearedJustNow(true);
    });
  };

  return (
    <section className="space-y-6">
      <div className="rounded-md border border-border bg-secondary/15 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-base font-medium">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              Personalized suggestions
            </h2>
            <p className="text-sm text-muted-foreground">
              When on, Discover surfaces rows tailored to what you&apos;ve liked,
              downloaded, and listened to. When off, those rows are hidden and
              new listens are not recorded.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => handleToggle(!enabled)}
            disabled={pendingToggle}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
              enabled ? "bg-primary" : "bg-secondary"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
            <span className="sr-only">
              {enabled ? "Personalization on" : "Personalization off"}
            </span>
          </button>
        </div>
      </div>

      <div className="rounded-md border border-border bg-secondary/15 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-base font-medium">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
              Listening history
            </h2>
            <p className="text-sm text-muted-foreground">
              {eventCount.toLocaleString()} play
              {eventCount === 1 ? "" : "s"} recorded. Clearing erases all of
              your listening history; the next visit to Discover will recompute
              recommendations from scratch.
            </p>
            {clearedJustNow && (
              <p className="text-xs text-muted-foreground">
                History cleared.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClear}
            disabled={pendingClear || eventCount === 0}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-muted-foreground"
          >
            {pendingClear ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Clear history
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </section>
  );
}
