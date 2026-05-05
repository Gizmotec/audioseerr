"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LidarrQualityProfile, LidarrRootFolder } from "@/lib/lidarr";
import {
  type LidarrProbeResult,
  probeLidarrAction,
  saveAdminSettingsAction,
} from "./actions";
import { KEY_UNCHANGED_SENTINEL } from "./constants";

type Initial = {
  lidarrUrl: string;
  // Empty string when no key is stored yet; the masked dots otherwise.
  lidarrApiKeyMasked: string;
  lidarrDefaultProfileId: number | null;
  lidarrRootFolderPath: string;
  lastFmApiKey: string;
  mediaPathMap: string;
  registrationMode: string;
  requireApproval: boolean;
};

type EnvFlags = {
  youtube: boolean;
  authSecret: boolean;
  audioseerrSecret: boolean;
};

export type StorageInfo = {
  rootFolderPath: string | null;
  diskPath: string | null;
  freeSpace: number | null;
  totalSpace: number | null;
  librarySize: number | null;
  artistCount: number | null;
  trackFileCount: number | null;
};

export function SettingsForm({
  initial,
  profiles: initialProfiles,
  rootFolders: initialRootFolders,
  lidarrReachable: initialReachable,
  storage,
  env,
}: {
  initial: Initial;
  profiles: LidarrQualityProfile[];
  rootFolders: LidarrRootFolder[];
  lidarrReachable: boolean;
  storage: StorageInfo | null;
  env: EnvFlags;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Lidarr controls — start from initial, then update if the user re-probes
  // the connection (so they can pick up newly-added profiles or folders).
  const [lidarrUrl, setLidarrUrl] = useState(initial.lidarrUrl);
  const [lidarrApiKey, setLidarrApiKey] = useState(initial.lidarrApiKeyMasked);
  // Track whether the user actually edited the key field. If they didn't, we
  // send a sentinel back so the action keeps the existing encrypted value.
  const [keyEdited, setKeyEdited] = useState(false);
  const [profileId, setProfileId] = useState<number | null>(
    initial.lidarrDefaultProfileId,
  );
  const [rootFolder, setRootFolder] = useState(initial.lidarrRootFolderPath);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [rootFolders, setRootFolders] = useState(initialRootFolders);
  const [reachable, setReachable] = useState(initialReachable);
  const [probing, setProbing] = useState(false);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);

  // Other settings.
  const [lastFmApiKey, setLastFmApiKey] = useState(initial.lastFmApiKey);
  const [mediaPathMap, setMediaPathMap] = useState(initial.mediaPathMap);
  const [registrationMode, setRegistrationMode] = useState(initial.registrationMode);
  const [requireApproval, setRequireApproval] = useState(initial.requireApproval);

  async function probe() {
    setProbing(true);
    setProbeMsg(null);
    // If the key field still shows the masked placeholder, we haven't been
    // given a fresh key — send the sentinel and let the server pull the
    // currently-stored key.
    const res: LidarrProbeResult = await probeLidarrAction({
      url: lidarrUrl,
      apiKey: keyEdited ? lidarrApiKey : KEY_UNCHANGED_SENTINEL,
    });
    setProbing(false);
    if (!res.ok) {
      setReachable(false);
      setProbeMsg(res.error);
      return;
    }
    setProfiles(res.profiles);
    setRootFolders(res.rootFolders);
    setReachable(true);
    setProbeMsg(`Connected to Lidarr ${res.version}.`);
    // If the saved profile/folder no longer exist (renamed in Lidarr), clear
    // them so the form forces a re-pick.
    if (profileId && !res.profiles.find((p) => p.id === profileId)) {
      setProfileId(null);
    }
    if (rootFolder && !res.rootFolders.find((r) => r.path === rootFolder)) {
      setRootFolder("");
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (!profileId) {
      setError("Pick a default Lidarr quality profile.");
      return;
    }
    if (!rootFolder) {
      setError("Pick a Lidarr root folder.");
      return;
    }

    startTransition(async () => {
      const res = await saveAdminSettingsAction({
        lidarrUrl,
        lidarrApiKey: keyEdited ? lidarrApiKey : KEY_UNCHANGED_SENTINEL,
        lidarrDefaultProfileId: profileId,
        lidarrRootFolderPath: rootFolder,
        lastFmApiKey,
        mediaPathMap,
        registrationMode,
        requireApproval,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setKeyEdited(false);
      setLidarrApiKey(initial.lidarrApiKeyMasked || "••••••••");
      router.refresh();
    });
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      {/* Lidarr */}
      <Card>
        <CardHeader>
          <CardTitle>Lidarr</CardTitle>
          <CardDescription>
            Connection and defaults used when approving requests.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lidarrUrl">URL</Label>
              <Input
                id="lidarrUrl"
                value={lidarrUrl}
                onChange={(e) => setLidarrUrl(e.target.value)}
                placeholder="http://lidarr:8686"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lidarrApiKey">API key</Label>
              <Input
                id="lidarrApiKey"
                type="password"
                value={lidarrApiKey}
                onChange={(e) => {
                  setLidarrApiKey(e.target.value);
                  setKeyEdited(true);
                }}
                onFocus={() => {
                  // Clear the masked placeholder so the user types onto a blank
                  // field — same trick browsers use for password autofill.
                  if (!keyEdited && lidarrApiKey.startsWith("••")) {
                    setLidarrApiKey("");
                  }
                }}
                placeholder="From Lidarr → Settings → General → API Key"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={probe} disabled={probing}>
              {probing ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Testing
                </>
              ) : (
                "Test connection"
              )}
            </Button>
            {probeMsg && (
              <span
                className={
                  reachable ? "text-sm text-green-500" : "text-sm text-destructive"
                }
              >
                {probeMsg}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile">Default quality profile</Label>
              <select
                id="profile"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                value={profileId ?? ""}
                onChange={(e) =>
                  setProfileId(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">— Select —</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                {/* If we couldn't reach Lidarr, surface the saved id so the
                    user knows it's still set. */}
                {!reachable && profileId && !profiles.find((p) => p.id === profileId) && (
                  <option value={profileId}>id #{profileId} (Lidarr unreachable)</option>
                )}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rootFolder">Root folder</Label>
              <select
                id="rootFolder"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                value={rootFolder}
                onChange={(e) => setRootFolder(e.target.value)}
              >
                <option value="">— Select —</option>
                {rootFolders.map((r) => (
                  <option key={r.id} value={r.path}>
                    {r.path}
                  </option>
                ))}
                {!reachable && rootFolder && !rootFolders.find((r) => r.path === rootFolder) && (
                  <option value={rootFolder}>{rootFolder} (Lidarr unreachable)</option>
                )}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Library playback */}
      <Card>
        <CardHeader>
          <CardTitle>Library playback</CardTitle>
          <CardDescription>
            Path translations for streaming downloaded tracks. Lidarr reports
            files at its own filesystem view; if Audioseerr mounts the library
            at a different path, list the translations here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="mediaPathMap">Path map</Label>
          <Input
            id="mediaPathMap"
            value={mediaPathMap}
            onChange={(e) => setMediaPathMap(e.target.value)}
            placeholder="/music:/data/music,/downloads:/data/dl"
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated <code className="font-mono">lidarrPath:localPath</code> pairs.
            Longest prefix wins. Leave empty when both containers see the
            library at the same path.
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

      {/* Requests */}
      <Card>
        <CardHeader>
          <CardTitle>Requests &amp; users</CardTitle>
          <CardDescription>
            How requests get approved and who can sign up.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="requireApproval"
              className="mt-1"
              checked={requireApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
            />
            <div>
              <Label htmlFor="requireApproval" className="cursor-pointer">
                Require admin approval for requests
              </Label>
              <p className="text-xs text-muted-foreground">
                When off, requests are auto-approved and sent straight to Lidarr.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="registrationMode">Registration</Label>
            <select
              id="registrationMode"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30 md:w-64"
              value={registrationMode}
              onChange={(e) => setRegistrationMode(e.target.value)}
            >
              <option value="CLOSED">Closed (admin creates accounts)</option>
              <option value="OPEN">Open (anyone with the URL)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Storage */}
      <StorageCard storage={storage} />

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

function StorageCard({ storage }: { storage: StorageInfo | null }) {
  if (!storage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Storage</CardTitle>
          <CardDescription>
            Connect Lidarr above to see library size and free space.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { freeSpace, totalSpace, librarySize, rootFolderPath, diskPath } =
    storage;
  const usedSpace =
    freeSpace !== null && totalSpace !== null ? totalSpace - freeSpace : null;
  const usedPct =
    usedSpace !== null && totalSpace !== null && totalSpace > 0
      ? Math.min(100, (usedSpace / totalSpace) * 100)
      : null;
  const libraryPct =
    librarySize !== null && totalSpace !== null && totalSpace > 0
      ? Math.min(100, (librarySize / totalSpace) * 100)
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Storage</CardTitle>
        <CardDescription>
          {rootFolderPath ? (
            <>
              Library at <code className="font-mono text-xs">{rootFolderPath}</code>
              {diskPath && diskPath !== rootFolderPath && (
                <>
                  {" "}
                  on <code className="font-mono text-xs">{diskPath}</code>
                </>
              )}
              .
            </>
          ) : (
            "Reported by Lidarr."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {totalSpace !== null && usedSpace !== null && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Disk usage</span>
              <span>
                {formatBytes(usedSpace)} used of {formatBytes(totalSpace)}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-muted">
              {usedPct !== null && (
                <div
                  className="absolute inset-y-0 left-0 bg-muted-foreground/40"
                  style={{ width: `${usedPct}%` }}
                />
              )}
              {libraryPct !== null && (
                <div
                  className="absolute inset-y-0 left-0 bg-primary"
                  style={{ width: `${libraryPct}%` }}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                Audioseerr library
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
                Other usage
              </span>
              {freeSpace !== null && (
                <span className="ml-auto">{formatBytes(freeSpace)} free</span>
              )}
            </div>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <StorageStat
            label="Library size"
            value={librarySize !== null ? formatBytes(librarySize) : "—"}
          />
          <StorageStat
            label="Free space"
            value={freeSpace !== null ? formatBytes(freeSpace) : "—"}
          />
          <StorageStat
            label="Artists"
            value={
              storage.artistCount !== null
                ? storage.artistCount.toLocaleString()
                : "—"
            }
          />
          <StorageStat
            label="Track files"
            value={
              storage.trackFileCount !== null
                ? storage.trackFileCount.toLocaleString()
                : "—"
            }
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function StorageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** i;
  return `${value >= 100 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
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
