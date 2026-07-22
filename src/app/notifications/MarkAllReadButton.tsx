"use client";

import { CheckCheck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markAllRead } from "@/lib/actions/notifications";

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllRead();
          router.refresh();
        })
      }
    >
      {pending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
      )}
      Mark all read
    </Button>
  );
}
