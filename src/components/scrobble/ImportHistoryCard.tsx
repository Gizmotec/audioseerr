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
import {
  importLastFmHistoryAction,
  importListenBrainzHistoryAction,
  type ImportHistoryResult,
} from "@/lib/actions/importHistory";

type Service = "lastfm" | "listenbrainz";

const SERVICE_COPY: Record<
  Service,
  { label: string; noun: string; nounPlural: string; description: string }
> = {
  lastfm: {
    label: "Last.fm",
    noun: "scrobble",
    nounPlural: "scrobbles",
    description:
      "into your Audioseerr play history — up to 2,000 at a time, older than what's already here. Duplicates are skipped, so it's safe to run again for older history.",
  },
  listenbrainz: {
    label: "ListenBrainz",
    noun: "listen",
    nounPlural: "listens",
    description:
      "into your Audioseerr play history — both newer and older than what's already here, up to 1,000 each way at a time. Plays Audioseerr already scrobbled to ListenBrainz are skipped, as are duplicates, so it's safe to run again.",
  },
};

type ImportState =
  | { status: "idle" }
  | { status: "done"; imported: number; skipped: number }
  | { status: "error"; message: string };

export function ImportHistoryCard({
  service,
  username,
}: {
  service: Service;
  username: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ImportState>({ status: "idle" });
  const copy = SERVICE_COPY[service];

  function run() {
    setState({ status: "idle" });
    startTransition(async () => {
      const res: ImportHistoryResult =
        service === "lastfm"
          ? await importLastFmHistoryAction()
          : await importListenBrainzHistoryAction();
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
          Pull your {copy.label} {copy.nounPlural}
          {username ? (
            <>
              {" "}
              (<strong>{username}</strong>)
            </>
          ) : null}{" "}
          {copy.description}
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
            `Import from ${copy.label}`
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
              {state.imported === 1 ? copy.noun : copy.nounPlural}
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
