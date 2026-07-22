"use client";

import { CheckCircle2, History, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { importLastFmHistoryAction } from "@/lib/actions/importHistory";

type ImportState =
  | { status: "idle" }
  | { status: "done"; imported: number; skipped: number }
  | { status: "error"; message: string };

export function ImportHistoryCard({ username }: { username: string | null }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ImportState>({ status: "idle" });

  function run() {
    setState({ status: "idle" });
    startTransition(async () => {
      const res = await importLastFmHistoryAction();
      if (!res.ok) {
        setState({ status: "error", message: res.error });
        return;
      }
      setState({
        status: "done",
        imported: res.imported,
        skipped: res.skipped,
      });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> Import listening history
        </CardTitle>
        <CardDescription>
          Pull your Last.fm scrobbles
          {username ? (
            <>
              {" "}
              (<strong>{username}</strong>)
            </>
          ) : null}{" "}
          into your Audioseerr play history — up to 2,000 at a time, older than
          what&apos;s already here. Duplicates are skipped, so it&apos;s safe to
          run again for older history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={run}
          disabled={pending}
        >
          {pending ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Importing
            </>
          ) : (
            "Import from Last.fm"
          )}
        </Button>

        {state.status === "done" &&
          (state.imported === 0 ? (
            <p className="inline-flex items-center gap-1.5 text-sm text-green-500">
              <CheckCircle2 className="h-4 w-4" /> Up to date — nothing new to
              import.
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-sm text-green-500">
              <CheckCircle2 className="h-4 w-4" /> Imported {state.imported}{" "}
              {state.imported === 1 ? "scrobble" : "scrobbles"}
              {state.skipped > 0
                ? ` · ${state.skipped} already here, skipped`
                : ""}
              .
            </p>
          ))}
        {state.status === "error" && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
