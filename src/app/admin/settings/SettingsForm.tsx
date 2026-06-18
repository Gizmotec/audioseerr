"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type SlskdProbeResult,
  probeSlskdAction,
  saveAdminSettingsAction,
} from "./actions";
import { KEY_UNCHANGED_SENTINEL } from "./constants";

type Initial = {
  slskdUrl: string;
  slskdApiKeyMasked: string;
  slskdDownloadPath: string;
  lastFmApiKey: string;
  mediaPathMap: string;
};

type EnvFlags = {
  youtube: boolean;
  authSecret: boolean;
  audioseerrSecret: boolean;
};

export function SettingsForm({
  initial,
  env,
}: {
  initial: Initial;
  env: EnvFlags;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [slskdUrl, setSlskdUrl] = useState(initial.slskdUrl);
  const [slskdApiKey, setSlskdApiKey] = useState(initial.slskdApiKeyMasked);
  const [slskdKeyEdited, setSlskdKeyEdited] = useState(false);
  const [slskdDownloadPath, setSlskdDownloadPath] = useState(
    initial.slskdDownloadPath,
  );
  const [slskdTesting, setSlskdTesting] = useState(false);
  const [slskdProbeMsg, setSlskdProbeMsg] = useState<string | null>(null);

  const [lastFmApiKey, setLastFmApiKey] = useState(initial.lastFmApiKey);
  const [mediaPathMap, setMediaPathMap] = useState(initial.mediaPathMap);

  async function probeSlskd() {
    setSlskdTesting(true);
    setSlskdProbeMsg(null);
    const res: SlskdProbeResult = await probeSlskdAction({
      url: slskdUrl,
      apiKey:
        slskdKeyEdited || !initial.slskdApiKeyMasked
          ? slskdApiKey
          : KEY_UNCHANGED_SENTINEL,
    });
    setSlskdTesting(false);
    setSlskdProbeMsg(res.ok ? "Connected to slskd." : res.error);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const res = await saveAdminSettingsAction({
        slskdUrl,
        slskdApiKey:
          slskdKeyEdited || !initial.slskdApiKeyMasked
            ? slskdApiKey
            : KEY_UNCHANGED_SENTINEL,
        slskdDownloadPath,
        lastFmApiKey,
        mediaPathMap,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setSlskdKeyEdited(false);
      if (slskdApiKey) setSlskdApiKey("••••••••");
      router.refresh();
    });
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      {/* Soulseek (slskd) */}
      <Card>
        <CardHeader>
          <CardTitle>Soulseek (slskd)</CardTitle>
          <CardDescription>
            The download source for everything — singles, albums, and playlist
            auto-fetch all search Soulseek via slskd.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="slskdUrl">slskd URL</Label>
              <Input
                id="slskdUrl"
                value={slskdUrl}
                onChange={(e) => setSlskdUrl(e.target.value)}
                placeholder="http://slskd:5030"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slskdApiKey">API key</Label>
              <Input
                id="slskdApiKey"
                type="password"
                value={slskdApiKey}
                onChange={(e) => {
                  setSlskdApiKey(e.target.value);
                  setSlskdKeyEdited(true);
                }}
                onFocus={() => {
                  if (!slskdKeyEdited && slskdApiKey.startsWith("••")) {
                    setSlskdApiKey("");
                  }
                }}
                placeholder="From slskd config → web.authentication.api_keys"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slskdDownloadPath">Download path</Label>
            <Input
              id="slskdDownloadPath"
              value={slskdDownloadPath}
              onChange={(e) => setSlskdDownloadPath(e.target.value)}
              placeholder="/downloads (slskd's completed-downloads directory)"
            />
            <p className="text-xs text-muted-foreground">
              Where slskd writes finished files. If Audioseerr mounts that
              directory at a different path, add the translation to the path map
              below.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={probeSlskd}
              disabled={pending || slskdTesting}
            >
              {slskdTesting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Testing
                </>
              ) : (
                "Test connection"
              )}
            </Button>
            {slskdProbeMsg && (
              <span
                className={
                  slskdProbeMsg.startsWith("Connected")
                    ? "text-sm text-green-500"
                    : "text-sm text-destructive"
                }
                role="status"
              >
                {slskdProbeMsg}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Library playback */}
      <Card>
        <CardHeader>
          <CardTitle>Library playback</CardTitle>
          <CardDescription>
            Path translations for streaming downloaded files. If Audioseerr
            mounts the download directory at a different path than slskd writes
            to, list the translations here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="mediaPathMap">Path map</Label>
          <Input
            id="mediaPathMap"
            value={mediaPathMap}
            onChange={(e) => setMediaPathMap(e.target.value)}
            placeholder="/downloads:/data/dl"
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated{" "}
            <code className="font-mono">slskdPath:localPath</code> pairs. Longest
            prefix wins. Leave empty when both containers see the directory at
            the same path.
          </p>
        </CardContent>
      </Card>

      {/* Discovery */}
      <Card>
        <CardHeader>
          <CardTitle>Discovery</CardTitle>
          <CardDescription>External APIs that power browse + search.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="lastFm">Last.fm API key</Label>
          <Input
            id="lastFm"
            value={lastFmApiKey}
            onChange={(e) => setLastFmApiKey(e.target.value)}
            placeholder="Optional — enables tag charts and genre browsing"
          />
        </CardContent>
      </Card>

      {/* System info */}
      <Card>
        <CardHeader>
          <CardTitle>System</CardTitle>
          <CardDescription>
            Read-only — these are configured via environment variables.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <EnvRow label="AUTH_SECRET" set={env.authSecret} />
            <EnvRow label="AUDIOSEERR_SECRET" set={env.audioseerrSecret} />
            <EnvRow label="YOUTUBE_API_KEY" set={env.youtube} />
          </dl>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-lg border bg-background/95 p-3 backdrop-blur">
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-green-500">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}

function EnvRow({ label, set }: { label: string; set: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <code className="font-mono text-xs">{label}</code>
      <span
        className={
          set ? "text-xs text-green-500" : "text-xs text-muted-foreground"
        }
      >
        {set ? "set" : "not set"}
      </span>
    </div>
  );
}
