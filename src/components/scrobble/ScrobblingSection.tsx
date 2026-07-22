"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProviderLogo } from "@/components/provider-logos";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  connectListenBrainzAction,
  disconnectLastFmAction,
  disconnectListenBrainzAction,
  setLastFmEnabledAction,
  setListenBrainzEnabledAction,
} from "@/lib/actions/scrobble";

export type ScrobblingSectionProps = {
  listenbrainz: {
    connected: boolean;
    username: string | null;
    enabled: boolean;
  };
  lastfm: {
    connected: boolean;
    username: string | null;
    enabled: boolean;
    /** App-level API key + secret present (admin-configured). */
    configured: boolean;
  };
  scrobbleConnected: string | null;
  scrobbleError: string | null;
};

const CALLBACK_ERRORS: Record<string, string> = {
  lastfm_unconfigured:
    "Last.fm isn't configured on this server — your admin must add the Last.fm API secret in admin settings.",
  token_failed: "Couldn't start the Last.fm authorization. Try again.",
  missing_state: "Authorization session expired. Try connecting again.",
  invalid_state: "Authorization session was tampered with. Try connecting again.",
  state_mismatch: "Authorization token mismatch. Try connecting again.",
  user_mismatch: "The Last.fm callback hit the wrong account. Sign in again.",
  session_failed: "Last.fm rejected the authorization. Try connecting again.",
};

export function ScrobblingSection({
  listenbrainz,
  lastfm,
  scrobbleConnected,
  scrobbleError,
}: ScrobblingSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
        Scrobbling
      </h2>
      <p className="text-xs text-muted-foreground">
        Send plays to Last.fm and ListenBrainz once they cross the scrobble
        threshold (50% of the track or 4 minutes — the same rule as your play
        history).
      </p>

      {scrobbleConnected === "lastfm" && (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-500">
          Last.fm connected — scrobbling is on.
        </div>
      )}
      {scrobbleError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {CALLBACK_ERRORS[scrobbleError] ?? `Scrobbling error: ${scrobbleError}`}
        </div>
      )}

      <ListenBrainzCard {...listenbrainz} />
      <LastFmCard {...lastfm} />
    </section>
  );
}

function ServiceHeader({
  provider,
  title,
  description,
}: {
  provider: "lastfm" | "listenbrainz";
  title: string;
  description: string;
}) {
  return (
    <CardHeader>
      <div className="flex items-center gap-3">
        <ProviderLogo provider={provider} />
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </div>
    </CardHeader>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
}

function ListenBrainzCard({
  connected,
  username,
  enabled: initialEnabled,
}: ScrobblingSectionProps["listenbrainz"]) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState("");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);

  function connect() {
    setError(null);
    startTransition(async () => {
      const res = await connectListenBrainzAction(token);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setToken("");
      router.refresh();
    });
  }

  function disconnect() {
    setError(null);
    startTransition(async () => {
      const res = await disconnectListenBrainzAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function toggle(checked: boolean) {
    setEnabled(checked);
    setError(null);
    startTransition(async () => {
      const res = await setListenBrainzEnabledAction(checked);
      if (!res.ok) {
        setEnabled(!checked);
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <ServiceHeader
        provider="listenbrainz"
        title="ListenBrainz"
        description="Open scrobbling from the MetaBrainz project. Track your listening at listenbrainz.org."
      />
      <CardContent className="space-y-4">
        {connected ? (
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="inline-flex items-center gap-1.5 text-sm text-green-500">
                <CheckCircle2 className="h-4 w-4" /> Connected as{" "}
                <strong>{username}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Scrobble listens to ListenBrainz
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                aria-label="Scrobble to ListenBrainz"
                checked={enabled}
                onCheckedChange={toggle}
                disabled={pending}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={disconnect}
                disabled={pending}
              >
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="listenbrainzToken">User token</Label>
              <Input
                id="listenbrainzToken"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (token.trim() && !pending) connect();
                  }
                }}
                placeholder="From listenbrainz.org/profile/"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                Found on your ListenBrainz profile page. Validated against
                ListenBrainz before it&apos;s saved.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={connect}
              disabled={pending || !token.trim()}
            >
              {pending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />{" "}
                  Connecting
                </>
              ) : (
                "Connect ListenBrainz"
              )}
            </Button>
          </>
        )}
        {error && <ErrorBox message={error} />}
      </CardContent>
    </Card>
  );
}

function LastFmCard({
  connected,
  username,
  enabled: initialEnabled,
  configured,
}: ScrobblingSectionProps["lastfm"]) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);

  function disconnect() {
    setError(null);
    startTransition(async () => {
      const res = await disconnectLastFmAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function toggle(checked: boolean) {
    setEnabled(checked);
    setError(null);
    startTransition(async () => {
      const res = await setLastFmEnabledAction(checked);
      if (!res.ok) {
        setEnabled(!checked);
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <ServiceHeader
        provider="lastfm"
        title="Last.fm"
        description="Scrobble plays to your Last.fm profile."
      />
      <CardContent className="space-y-4">
        {connected ? (
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="inline-flex items-center gap-1.5 text-sm text-green-500">
                <CheckCircle2 className="h-4 w-4" /> Connected as{" "}
                <strong>{username}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Scrobble listens to Last.fm
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                aria-label="Scrobble to Last.fm"
                checked={enabled}
                onCheckedChange={toggle}
                disabled={pending}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={disconnect}
                disabled={pending}
              >
                Disconnect
              </Button>
            </div>
          </div>
        ) : configured ? (
          <a
            href="/api/scrobble/lastfm/connect"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Connect Last.fm
          </a>
        ) : (
          <div className="flex gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Last.fm scrobbling needs an API secret — your admin must add the
              Last.fm API secret in admin settings before anyone can connect.
            </p>
          </div>
        )}
        {error && <ErrorBox message={error} />}
      </CardContent>
    </Card>
  );
}
