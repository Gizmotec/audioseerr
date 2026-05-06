"use client";

import { Loader2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { unrequestAction } from "@/lib/actions/requests";
import type { RequestType } from "@prisma/client";

type Props = {
  request: {
    id: string;
    type: RequestType;
    mbid: string;
    albumMbid: string | null;
  };
};

export function UnrequestButton({ request }: Props) {
  const [pending, startTransition] = useTransition();
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (removed) {
    return (
      <span className="text-xs text-muted-foreground" aria-live="polite">
        Removed
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await unrequestAction({
              requestId: request.id,
              type: request.type,
              mbid: request.mbid,
              albumMbid: request.albumMbid,
            });
            if (result.ok) setRemoved(true);
            else setError(result.error);
          });
        }}
        className="gap-1.5"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <X className="h-3.5 w-3.5" />
        )}
        Unrequest
      </Button>
      {error && (
        <span className="max-w-40 text-right text-xs text-destructive" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
