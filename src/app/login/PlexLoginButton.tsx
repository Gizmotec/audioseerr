"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { startPlexLoginAction } from "./actions";

const POLL_INTERVAL_MS = 2000;
// Plex strong PINs live a few minutes; give up shortly after they'd expire.
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

type Flow = {
  pinId: string;
  code: string;
  authUrl: string;
};

/**
 * "Sign in with Plex" button + PIN-flow driver. Click → server action creates
 * the PIN → Plex auth page opens in a new tab → this page polls the local
 * status route until Plex reports the PIN authorized → the actual session is
 * minted by next-auth's signIn("plex"), which re-verifies everything
 * server-side (see src/lib/external-auth.ts).
 */
export function PlexLoginButton() {
  const router = useRouter();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  const stopPolling = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  // No polling survives unmount.
  useEffect(() => stopPolling, []);

  async function completeSignIn(pinId: string, code: string) {
    const res = await signIn("plex", { pinId, code, redirect: false });
    if (res?.error) {
      setFlow(null);
      setError("Plex sign-in failed. Try again.");
      return;
    }
    router.replace("/home");
    router.refresh();
  }

  function startPolling(pinId: string, code: string) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    timerRef.current = window.setInterval(() => {
      if (inFlightRef.current) return;
      if (Date.now() > deadline) {
        stopPolling();
        setFlow(null);
        setError("Plex sign-in timed out — the PIN expired. Try again.");
        return;
      }
      inFlightRef.current = true;
      fetch(
        `/api/auth/plex-callback?pinId=${encodeURIComponent(pinId)}&code=${encodeURIComponent(code)}`,
        { cache: "no-store" },
      )
        .then(async (res) => {
          if (!res.ok) return;
          const body = (await res.json()) as { status?: string };
          if (body.status === "ready") {
            stopPolling();
            await completeSignIn(pinId, code);
          }
        })
        .catch(() => {
          // Transient network hiccup — keep polling until the deadline.
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    }, POLL_INTERVAL_MS);
  }

  async function begin() {
    setError(null);
    setStarting(true);
    try {
      const result = await startPlexLoginAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.open(result.authUrl, "_blank", "noopener,noreferrer");
      setFlow({ pinId: result.pinId, code: result.code, authUrl: result.authUrl });
      startPolling(result.pinId, result.code);
    } finally {
      setStarting(false);
    }
  }

  function cancel() {
    stopPolling();
    setFlow(null);
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={begin}
        disabled={starting || flow !== null}
      >
        {flow ? "Waiting for Plex…" : starting ? "Contacting Plex…" : "Sign in with Plex"}
      </Button>
      {flow && (
        <p className="text-xs text-muted-foreground">
          Finish signing in on the Plex tab — this page continues automatically.{" "}
          <a
            href={flow.authUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline"
          >
            Reopen Plex
          </a>{" "}
          ·{" "}
          <button type="button" onClick={cancel} className="underline">
            Cancel
          </button>
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
