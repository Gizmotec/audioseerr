"use client";

import { Loader2, RefreshCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { syncNowAction } from "./actions";

export function SyncNowButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const click = () => {
    setMessage(null);
    startTransition(async () => {
      const r = await syncNowAction();
      if (r.ok) {
        const lib = `library: ${r.library.albums} album${r.library.albums === 1 ? "" : "s"}`;
        const req =
          r.requests.scanned === 0
            ? "no active requests"
            : `${r.requests.scanned} request${r.requests.scanned === 1 ? "" : "s"} (${r.requests.changed} change${r.requests.changed === 1 ? "" : "s"})`;
        setMessage(`${lib}, ${req}.`);
      } else {
        setMessage(r.error);
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={click}
        disabled={pending}
        className="gap-1.5"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCcw className="h-4 w-4" />
        )}
        {pending ? "Syncing…" : "Sync now"}
      </Button>
      {message && (
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {message}
        </span>
      )}
    </div>
  );
}
