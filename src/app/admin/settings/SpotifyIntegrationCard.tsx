"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  disconnectSpotifyAction,
  saveSpotifyClientIdAction,
} from "@/lib/actions/spotify";
import { IntegrationCard } from "./IntegrationCard";

export type SpotifyIntegration = {
  initialClientId: string;
  connected: boolean;
  redirectUri: string;
  oauthConnected: boolean;
  oauthError: string | null;
  reason: string | null;
};

// Copy text to the clipboard, falling back to the legacy execCommand path.
// navigator.clipboard only exists in a secure context (HTTPS or localhost), so
// over plain http:// — e.g. accessing Audioseerr at http://<lan-ip>:port — it
// is undefined and the async API can't be used. Returns whether the copy stuck.
async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path below.
    }
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_client_id: "Save your Spotify Client ID before connecting.",
  missing_state: "OAuth session expired. Try connecting again.",
  invalid_state: "OAuth session was tampered with. Try connecting again.",
  state_mismatch: "OAuth state mismatch. Try connecting again.",
  user_mismatch: "OAuth callback hit the wrong account. Sign in again.",
  exchange_failed:
    "Spotify rejected the authorization. Check your Client ID and the redirect URI registered in your Spotify app.",
  access_denied: "You declined the Spotify authorization.",
};

// The full per-user Spotify connection flow as an expandable integration
// card. Self-contained: it saves through its own server actions, independent
// of the surrounding admin settings form.
export function SpotifyIntegrationCard({
  initialClientId,
  connected,
  redirectUri,
  oauthConnected,
  oauthError,
  reason,
}: SpotifyIntegration) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(
    !!reason || !!oauthError || oauthConnected,
  );
  const [clientId, setClientId] = useState(initialClientId);
  const [savedClientId, setSavedClientId] = useState(initialClientId);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const dirty = clientId.trim() !== savedClientId.trim();

  // Spotify rejects http:// redirect URIs unless the host is a loopback
  // literal (127.0.0.1 / [::1] — "localhost" is NOT allowed). When Audioseerr
  // is reached over plain http:// at a LAN/Tailscale IP, the derived redirect
  // URI can never satisfy Spotify, so warn before the user wastes a round trip.
  const redirectHost = (() => {
    try {
      return new URL(redirectUri).hostname;
    } catch {
      return "";
    }
  })();
  const redirectInsecure =
    redirectUri.startsWith("http://") &&
    redirectHost !== "127.0.0.1" &&
    redirectHost !== "[::1]" &&
    redirectHost !== "::1";

  function saveClientId() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveSpotifyClientIdAction(clientId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedClientId(clientId.trim());
      setSaved(true);
      router.refresh();
    });
  }

  function disconnect() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await disconnectSpotifyAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  async function copyRedirectUri() {
    const ok = await copyText(redirectUri);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <IntegrationCard
      provider="spotify"
      name="Spotify"
      description="Import your Spotify playlists. Each user connects their own Spotify account."
      connected={connected}
      action={{ onToggle: () => setExpanded((v) => !v), expanded }}
    >
      <div className="flex flex-col gap-5">
        {reason === "connect_spotify" && !connected && (
          <div className="rounded-md border border-border bg-secondary/15 px-3 py-2 text-sm text-muted-foreground">
            Connect Spotify below to import your playlists.
          </div>
        )}
        {redirectInsecure && (
          <div className="flex gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">Spotify needs a secure (HTTPS) address</p>
              <p className="text-amber-700/90 dark:text-amber-300/90">
                You&apos;re reaching Audioseerr over an insecure{" "}
                <code className="font-mono">http://</code> address, so Spotify
                will reject the redirect URI below with{" "}
                <span className="font-mono text-xs">
                  redirect_uri: Not matching configuration
                </span>
                . Connecting only works from an <strong>https://</strong>{" "}
                address (or <code className="font-mono">http://127.0.0.1</code>)
                — open Audioseerr there and connect from that URL.
              </p>
            </div>
          </div>
        )}
        <SetupSteps redirectUri={redirectUri} onCopy={copyRedirectUri} copied={copied} />

        <div className="space-y-1.5">
          <Label htmlFor="spotifyClientId">Client ID</Label>
          <Input
            id="spotifyClientId"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            onKeyDown={(e) => {
              // The card can sit inside the admin settings form — don't let
              // Enter submit that; save the Client ID instead.
              if (e.key === "Enter") {
                e.preventDefault();
                if (dirty && !pending) saveClientId();
              }
            }}
            placeholder="32-character ID from your Spotify app"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            Found on your Spotify app&apos;s settings page. The Client Secret is
            not needed — Audioseerr uses PKCE.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            onClick={saveClientId}
            disabled={pending || !dirty}
          >
            {pending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving
              </>
            ) : (
              "Save Client ID"
            )}
          </Button>

          {connected ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-sm text-green-500">
                <CheckCircle2 className="h-4 w-4" /> Connected
                <span className="text-xs text-muted-foreground">
                  · token refreshes automatically
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={disconnect}
                disabled={pending}
                className="ml-auto"
              >
                Disconnect
              </Button>
            </>
          ) : savedClientId && !dirty ? (
            <a
              href="/api/spotify/connect"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Connect Spotify
            </a>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled>
              Connect Spotify
            </Button>
          )}
        </div>

        {dirty && savedClientId && (
          <p className="text-xs text-muted-foreground">
            Save the Client ID before connecting.
          </p>
        )}

        {oauthConnected && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-500">
            Spotify connected. You can now import your playlists.
          </div>
        )}
        {oauthError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {ERROR_MESSAGES[oauthError] ?? `Spotify error: ${oauthError}`}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {saved && !error && (
          <span className="inline-flex items-center gap-1.5 text-sm text-green-500">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </IntegrationCard>
  );
}

function SetupSteps({
  redirectUri,
  onCopy,
  copied,
}: {
  redirectUri: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <ol className="space-y-2.5 rounded-md border border-border bg-secondary/15 px-4 py-3 text-sm text-muted-foreground">
      <li className="flex gap-2">
        <span className="font-medium text-foreground">1.</span>
        <span>
          Open the{" "}
          <a
            href="https://developer.spotify.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-foreground underline"
          >
            Spotify Developer Dashboard
            <ExternalLink className="h-3 w-3" />
          </a>{" "}
          and create a new app (any name and description).
        </span>
      </li>
      <li className="flex gap-2">
        <span className="font-medium text-foreground">2.</span>
        <span className="flex flex-1 flex-col gap-1.5">
          <span>Add this redirect URI to the app:</span>
          <span className="flex items-center gap-2">
            <code className="flex-1 truncate rounded border bg-background px-2 py-1 font-mono text-xs text-foreground">
              {redirectUri}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCopy}
              aria-live="polite"
              className={`shrink-0 transition-colors duration-150 ${
                copied ? "border-green-500/40 text-green-500" : ""
              }`}
            >
              {copied ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                "Copy"
              )}
            </Button>
          </span>
        </span>
      </li>
      <li className="flex gap-2">
        <span className="font-medium text-foreground">3.</span>
        <span>Copy the app&apos;s Client ID and paste it below, then save.</span>
      </li>
      <li className="flex gap-2">
        <span className="font-medium text-foreground">4.</span>
        <span>Click &ldquo;Connect Spotify&rdquo; to authorize.</span>
      </li>
    </ol>
  );
}
