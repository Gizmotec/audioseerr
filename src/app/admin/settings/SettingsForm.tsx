"use client";

import {
  Blocks,
  CheckCircle2,
  Loader2,
  Search,
  SearchX,
  Server,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  type SlskdProbeResult,
  probeSlskdAction,
  saveAdminSettingsAction,
} from "./actions";
import { KEY_UNCHANGED_SENTINEL } from "./constants";
import { IntegrationCard } from "./IntegrationCard";

type Initial = {
  slskdUrl: string;
  slskdApiKeyMasked: string;
  slskdDownloadPath: string;
  lastFmApiKey: string;
  mediaPathMap: string;
  preDownloadMixes: boolean;
};

type EnvFlags = {
  youtube: boolean;
  authSecret: boolean;
  audioseerrSecret: boolean;
};

export type StorageStats = {
  reachable: boolean;
  root: string | null;
  total: number;
  free: number;
  appBytes: number;
};

export type SpotifyStatus = {
  connected: boolean;
  clientIdSaved: boolean;
};

type TabId = "general" | "integrations" | "system";

const TABS: { id: TabId; label: string; icon: typeof Blocks }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "integrations", label: "Integrations", icon: Blocks },
  { id: "system", label: "System", icon: Server },
];

// Registry driving both the tabs and the settings search. `keywords` holds
// synonyms that don't appear in the rendered copy (e.g. "p2p" for slskd).
type SectionId =
  | "slskd"
  | "lastfm"
  | "spotify"
  | "playback"
  | "predownload"
  | "storage"
  | "system";

type SectionDef = { id: SectionId; tab: TabId; title: string; keywords: string };

const SECTIONS: SectionDef[] = [
  {
    id: "slskd",
    tab: "integrations",
    title: "Soulseek (slskd)",
    keywords: "soulseek slskd p2p download source url api key path connection",
  },
  {
    id: "lastfm",
    tab: "integrations",
    title: "Last.fm",
    keywords: "lastfm last.fm api key discovery tags charts genres similar",
  },
  {
    id: "spotify",
    tab: "integrations",
    title: "Spotify",
    keywords: "spotify playlists import oauth connect account",
  },
  {
    id: "playback",
    tab: "general",
    title: "Library playback",
    keywords: "path map streaming translate mount container volume",
  },
  {
    id: "predownload",
    tab: "general",
    title: "Discovery pre-download",
    keywords: "pre-download mixes daily mix discover weekly cache eager",
  },
  {
    id: "storage",
    tab: "system",
    title: "Storage",
    keywords: "disk usage space free volume download",
  },
  {
    id: "system",
    tab: "system",
    title: "System",
    keywords: "environment variables auth secret youtube api key read-only",
  },
];

const normalize = (s: string) => s.toLowerCase().trim();

export function SettingsForm({
  initial,
  env,
  storage,
  spotify,
}: {
  initial: Initial;
  env: EnvFlags;
  storage: StorageStats;
  spotify: SpotifyStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [tab, setTab] = useState<TabId>("general");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Partial<Record<SectionId, boolean>>>(
    {},
  );
  const toggleExpanded = (id: SectionId) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

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
  const [preDownloadMixes, setPreDownloadMixes] = useState(
    initial.preDownloadMixes,
  );

  const slskdConfigured = !!slskdUrl.trim() && !!slskdApiKey;
  const lastFmConfigured = !!lastFmApiKey.trim();

  const q = normalize(query);
  const searching = q.length > 0;

  const visibleSections = useMemo(
    () =>
      SECTIONS.filter(
        (s) =>
          !searching || normalize(`${s.title} ${s.keywords}`).includes(q),
      ),
    [q, searching],
  );

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
        preDownloadMixes,
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

  function renderSection(id: SectionId) {
    switch (id) {
      case "slskd":
        return (
          <IntegrationCard
            provider="soulseek"
            name="Soulseek (slskd)"
            description="The download source for everything — singles, albums, and playlist auto-fetch all search Soulseek via slskd."
            connected={slskdConfigured}
            action={{
              onToggle: () => toggleExpanded("slskd"),
              expanded: !!expanded.slskd,
            }}
          >
            <div className="flex flex-col gap-4">
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
                  directory at a different path, add the translation to the path
                  map under General.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={probeSlskd}
                  disabled={pending || slskdTesting}
                >
                  {slskdTesting ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Testing
                    </>
                  ) : (
                    "Test connection"
                  )}
                </Button>
                {slskdProbeMsg && (
                  <span
                    className={
                      slskdProbeMsg.startsWith("Connected")
                        ? "text-sm text-pastel-mint"
                        : "text-sm text-destructive"
                    }
                    role="status"
                  >
                    {slskdProbeMsg}
                  </span>
                )}
              </div>
            </div>
          </IntegrationCard>
        );
      case "lastfm":
        return (
          <IntegrationCard
            provider="lastfm"
            name="Last.fm"
            description="Powers discovery — tag charts, genre browsing, and similar-artist recommendations."
            connected={lastFmConfigured}
            action={{
              onToggle: () => toggleExpanded("lastfm"),
              expanded: !!expanded.lastfm,
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="lastFm">API key</Label>
              <Input
                id="lastFm"
                value={lastFmApiKey}
                onChange={(e) => setLastFmApiKey(e.target.value)}
                placeholder="Optional — enables tag charts and genre browsing"
              />
            </div>
          </IntegrationCard>
        );
      case "spotify":
        return (
          <IntegrationCard
            provider="spotify"
            name="Spotify"
            description="Import your Spotify playlists. Connected per user from the account page."
            connected={spotify.connected}
            action={{
              href: spotify.connected
                ? "/account"
                : spotify.clientIdSaved
                  ? "/api/spotify/connect"
                  : "/account",
            }}
          />
        );
      case "playback":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Library playback</CardTitle>
              <CardDescription>
                Path translations for streaming downloaded files. If Audioseerr
                mounts the download directory at a different path than slskd
                writes to, list the translations here.
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
                <code className="font-mono">slskdPath:localPath</code> pairs.
                Longest prefix wins. Leave empty when both containers see the
                directory at the same path.
              </p>
            </CardContent>
          </Card>
        );
      case "predownload":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Discovery pre-download</CardTitle>
              <CardDescription>
                Eagerly download Daily Mix and Discover Weekly tracks ahead of
                time so they play full-length instantly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="preDownloadMixes">
                    Pre-download mix tracks
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    A daily job fetches each mix&apos;s new songs into temporary
                    storage. Anything you don&apos;t like or add to a playlist
                    is auto-deleted (daily after ~2 days, weekly after ~8).
                    Needs a Last.fm API key.
                  </p>
                </div>
                <Switch
                  id="preDownloadMixes"
                  checked={preDownloadMixes}
                  onCheckedChange={(checked) => setPreDownloadMixes(checked)}
                />
              </div>
            </CardContent>
          </Card>
        );
      case "storage":
        return <StorageCard storage={storage} />;
      case "system":
        return (
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
        );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Search — outside the form so Enter never submits settings */}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings…"
          aria-label="Search settings"
          className="pr-7 pl-8"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {!searching && (
        <div
          role="tablist"
          aria-label="Settings sections"
          className="flex w-fit gap-1 rounded-full border-2 border-ink bg-surface-2 p-1"
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-bold transition-colors",
                tab === id
                  ? "border-ink bg-pastel-yellow text-ink"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      <form className="flex flex-col gap-6" onSubmit={onSubmit}>
        {searching ? (
          visibleSections.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-ink py-12 text-center">
              <SearchX className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No settings match &ldquo;{query}&rdquo;.
              </p>
            </div>
          ) : (
            TABS.map(({ id, label }) => {
              const inTab = visibleSections.filter((s) => s.tab === id);
              if (inTab.length === 0) return null;
              return (
                <section key={id} className="flex flex-col gap-3">
                  <h2 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    {label}
                  </h2>
                  {inTab.map((s) => (
                    <div key={s.id}>{renderSection(s.id)}</div>
                  ))}
                </section>
              );
            })
          )
        ) : (
          <div role="tabpanel" className="flex flex-col gap-6">
            {SECTIONS.filter((s) => s.tab === tab).map((s) => (
              <div key={s.id}>{renderSection(s.id)}</div>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-xl border-2 border-ink bg-pastel-red px-3 py-2 text-sm text-ink">
            {error}
          </div>
        )}

        <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-2xl border-2 border-ink bg-card p-3">
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm text-pastel-mint">
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
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function StorageCard({ storage }: { storage: StorageStats }) {
  const { reachable, root, total, free, appBytes } = storage;
  // App files are part of "used"; clamp so other (non-app) usage never goes
  // negative when the DB sum and the filesystem disagree (e.g. dev path map).
  const used = Math.max(0, total - free);
  const appOnDisk = Math.min(appBytes, used);
  const other = Math.max(0, used - appOnDisk);
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Storage</CardTitle>
        <CardDescription>
          Disk usage for the download volume{" "}
          {root ? <code className="font-mono text-xs">{root}</code> : null}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!reachable ? (
          <p className="text-sm text-muted-foreground">
            {root
              ? "Download path isn't reachable from Audioseerr — check the path map."
              : "Set a download path to see disk usage."}{" "}
            Library is using <strong>{formatBytes(appBytes)}</strong>.
          </p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full border-2 border-ink bg-surface-2">
              <div
                className="bg-pastel-pink"
                style={{ width: `${pct(appOnDisk)}%` }}
                title={`Audioseerr — ${formatBytes(appOnDisk)}`}
              />
              <div
                className="bg-pastel-lavender"
                style={{ width: `${pct(other)}%` }}
                title={`Other — ${formatBytes(other)}`}
              />
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <LegendItem
                dot="bg-pastel-pink"
                label="Audioseerr"
                value={formatBytes(appOnDisk)}
              />
              <LegendItem
                dot="bg-pastel-lavender"
                label="Other"
                value={formatBytes(other)}
              />
              <LegendItem dot="bg-surface-2" label="Free" value={formatBytes(free)} />
              <LegendItem label="Total" value={formatBytes(total)} />
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LegendItem({
  dot,
  label,
  value,
}: {
  dot?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {dot ? (
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full border border-ink", dot)} />
      ) : null}
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    </div>
  );
}

function EnvRow({ label, set }: { label: string; set: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border-2 border-ink px-3 py-2">
      <code className="font-mono text-xs">{label}</code>
      <span
        className={
          set ? "text-xs text-pastel-mint" : "text-xs text-muted-foreground"
        }
      >
        {set ? "set" : "not set"}
      </span>
    </div>
  );
}
