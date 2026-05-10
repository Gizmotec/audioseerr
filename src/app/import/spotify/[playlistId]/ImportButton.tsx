"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { type ImportResult, importPlaylistAction } from "../actions";

export function ImportButton({
  playlistId,
  matchedCount,
}: {
  playlistId: string;
  matchedCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  function submit() {
    setResult(null);
    startTransition(async () => {
      const res = await importPlaylistAction(playlistId);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  if (result?.ok) {
    const parts: string[] = [];
    if (result.created > 0) {
      parts.push(
        `${result.created} ${result.created === 1 ? "request" : "requests"} created`,
      );
    }
    if (result.autoApproved > 0) {
      parts.push(`${result.autoApproved} auto-approved`);
    }
    if (result.duplicates > 0) {
      parts.push(`${result.duplicates} already requested`);
    }
    if (result.unmatched > 0) parts.push(`${result.unmatched} unmatched`);
    if (result.autoApproveFailures > 0) {
      parts.push(`${result.autoApproveFailures} failed during auto-approve`);
    }
    return (
      <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2.5 text-sm text-green-500">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <CheckCircle2 className="h-4 w-4" /> Imported.
        </span>{" "}
        <span className="text-foreground">{parts.join(" · ") || "Nothing to do."}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={submit} disabled={pending || matchedCount === 0}>
        {pending ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Importing
          </>
        ) : (
          `Request ${matchedCount} ${matchedCount === 1 ? "track" : "tracks"}`
        )}
      </Button>
      {result && !result.ok && (
        <p className="text-sm text-destructive">{result.error}</p>
      )}
    </div>
  );
}
