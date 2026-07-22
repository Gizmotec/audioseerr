"use client";

import {
  Blocks,
  CheckCircle2,
  Loader2,
  Search,
  SearchX,
  Server,
  SlidersHorizontal,
  TriangleAlert,
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
  pingWebhookAction,
  probeSlskdAction,
  saveAdminSettingsAction,
} from "./actions";
import { KEY_UNCHANGED_SENTINEL } from "./constants";
import { IntegrationCard } from "./IntegrationCard";
import {
  type SpotifyIntegration,
  SpotifyIntegrationCard,
} from "./SpotifyIntegrationCard";

type Initial = {
  slskdUrl: string;
  slskdApiKeyMasked: string;
  slskdDownloadPath: string;
  lastFmApiKey: string;
  mediaPathMap: string;
  preDownloadMixes: boolean;
  notificationWebhookUrl: string;
  lastFmApiSecretMasked: string;
  oidcEnabled: boolean;
  oidcIssuerUrl: string;
  oidcClientId: string;
  oidcClientSecretMasked: string;
  oidcButtonLabel: string;
};

type EnvFlags = {
  youtube: boolean;
  authSecret: boolean;
  audioseerrSecret: boolean;
};

// Read-only status for the env-configured external login methods (Plex PIN
// flow, Jellyfin username/password). Computed on the server from the same
// helpers that built the Auth.js providers at boot.
export type ExternalLoginStatus = {
  plexEnabled: boolean;
  plexClientIdSet: boolean;
  jellyfinServerUrl: string | null;
  jellyfinApiKeySet: boolean;
};

export type StorageStats = {
  reachable: boolean;
  root: string | null;
  total: number;
  free: number;
  appBytes: number;
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
  | "notifications"
  | "youtube"
  | "playback"
  | "predownload"
  | "sso"
  | "external-login"
  | "storage";

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
    id: "notifications",
    tab: "integrations",
    title: "Notifications",
    keywords: "notifications webhook url discord ntfy gotify push alerts http",
  },
  {
    id: "youtube",
    tab: "integrations",
    title: "YouTube",
    keywords: "youtube video embed watch player api key environment variable",
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
    id: "sso",
    tab: "general",
    title: "Single sign-on (OIDC)",
    keywords:
      "sso oidc openid connect single sign-on authentik keycloak pocket id pocketid login authentication issuer client secret",
  },
  {
    id: "external-login",
    tab: "general",
    title: "External login (Plex, Jellyfin)",
    keywords:
      "plex jellyfin emby external login pin oauth media server sign-in environment variables read-only",
  },
  {
    id: "storage",
    tab: "system",
    title: "Storage",
    keywords: "disk usage space free volume download",
  },
];

const normalize = (s: string) => s.toLowerCase().trim();

export function SettingsForm({
  initial,
  env,
  externalLogin,
  storage,
  spotify,
  isAdmin,
  oidcCallbackUrl,
  initialTab = "general",
}: {
  initial: Initial;
  env: EnvFlags;
  externalLogin: ExternalLoginStatus;
  storage: StorageStats;
  spotify: SpotifyIntegration;
  isAdmin: boolean;
  oidcCallbackUrl: string;
  initialTab?: TabId;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [tab, setTab] = useState<TabId>(initialTab);
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
  const [lastFmApiSecret, setLastFmApiSecret] = useState(
    initial.lastFmApiSecretMasked,
  );
  const [lastFmSecretEdited, setLastFmSecretEdited] = useState(false);
  const [mediaPathMap, setMediaPathMap] = useState(initial.mediaPathMap);
  const [preDownloadMixes, setPreDownloadMixes] = useState(
    initial.preDownloadMixes,
  );
  const [notificationWebhookUrl, setNotificationWebhookUrl] = useState(
    initial.notificationWebhookUrl,
  );
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookPingMsg, setWebhookPingMsg] = useState<string | null>(null);

  const [oidcEnabled, setOidcEnabled] = useState(initial.oidcEnabled);
  const [oidcIssuerUrl, setOidcIssuerUrl] = useState(initial.oidcIssuerUrl);
  const [oidcClientId, setOidcClientId] = useState(initial.oidcClientId);
  const [oidcClientSecret, setOidcClientSecret] = useState(
    initial.oidcClientSecretMasked,
  );
  const [oidcSecretEdited, setOidcSecretEdited] = useState(false);
  const [oidcButtonLabel, setOidcButtonLabel] = useState(
    initial.oidcButtonLabel,
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

  async function pingWebhook() {
    setWebhookTesting(true);
    setWebhookPingMsg(null);
    const res = await pingWebhookAction({ url: notificationWebhookUrl });
    setWebhookTesting(false);
    setWebhookPingMsg(res.ok ? "Test notification delivered." : res.error);
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
        notificationWebhookUrl,
        lastFmApiSecret:
          lastFmSecretEdited || !initial.lastFmApiSecretMasked
            ? lastFmApiSecret
            : KEY_UNCHANGED_SENTINEL,
        oidcEnabled,
        oidcIssuerUrl,
        oidcClientId,
        oidcClientSecret:
          oidcSecretEdited || !initial.oidcClientSecretMasked
            ? oidcClientSecret
            : KEY_UNCHANGED_SENTINEL,
        oidcButtonLabel,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setSlskdKeyEdited(false);
      setLastFmSecretEdited(false);
      setOidcSecretEdited(false);
      if (slskdApiKey) setSlskdApiKey("••••••••");
      if (lastFmApiSecret) setLastFmApiSecret("••••••••");
      if (oidcClientSecret) setOidcClientSecret("••••••••");
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
            description="Powers discovery — tag charts, genre browsing, and similar-artist recommendations. The API secret additionally enables scrobbling."
            connected={lastFmConfigured}
            action={{
              onToggle: () => toggleExpanded("lastfm"),
              expanded: !!expanded.lastfm,
            }}
          >
            <div className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="lastFm">API key</Label>
                <Input
                  id="lastFm"
                  value={lastFmApiKey}
                  onChange={(e) => setLastFmApiKey(e.target.value)}
                  placeholder="Optional — enables tag charts and genre browsing"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastFmApiSecret">API secret</Label>
                <Input
                  id="lastFmApiSecret"
                  type="password"
                  value={lastFmApiSecret}
                  onChange={(e) => {
                    setLastFmApiSecret(e.target.value);
                    setLastFmSecretEdited(true);
                  }}
                  onFocus={() => {
                    if (!lastFmSecretEdited && lastFmApiSecret.startsWith("••")) {
                      setLastFmApiSecret("");
                    }
                  }}
                  placeholder="Optional — required for scrobbling"
                />
                <p className="text-xs text-muted-foreground">
                  From your Last.fm API account. Stored encrypted, like the
                  slskd key.
                </p>
              </div>
            </div>
          </IntegrationCard>
        );
      case "notifications":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                A global outbound webhook: Audioseerr POSTs a JSON event here
                whenever any request changes status (approved, declined,
                available, failed). Point it at Discord, ntfy, Gotify, or any
                receiver — deliveries time out after 4 seconds and never block
                requests.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="notificationWebhookUrl">Webhook URL</Label>
                <Input
                  id="notificationWebhookUrl"
                  value={notificationWebhookUrl}
                  onChange={(e) => setNotificationWebhookUrl(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/… (optional)"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={pingWebhook}
                  disabled={pending || webhookTesting}
                >
                  {webhookTesting ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Sending
                    </>
                  ) : (
                    "Send test notification"
                  )}
                </Button>
                {webhookPingMsg && (
                  <span
                    className={
                      webhookPingMsg.startsWith("Test notification delivered")
                        ? "text-sm text-pastel-mint"
                        : "text-sm text-destructive"
                    }
                    role="status"
                  >
                    {webhookPingMsg}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      case "spotify":
        return <SpotifyIntegrationCard {...spotify} />;
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
      case "sso":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Single sign-on (OIDC)</CardTitle>
              <CardDescription>
                Let people sign in with an external identity provider —
                Authentik, Keycloak, Pocket ID, or any OIDC-compliant issuer.
                SSO accounts are matched by email and created automatically on
                first login, always as regular users. Username/password
                sign-in keeps working either way.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="oidcEnabled">Enable SSO</Label>
                  <p className="text-xs text-muted-foreground">
                    Adds a sign-in button labeled “
                    {oidcButtonLabel.trim() || "SSO"}” to the login page.
                  </p>
                </div>
                <Switch
                  id="oidcEnabled"
                  checked={oidcEnabled}
                  onCheckedChange={(checked) => setOidcEnabled(checked)}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="oidcIssuerUrl">Issuer URL</Label>
                  <Input
                    id="oidcIssuerUrl"
                    value={oidcIssuerUrl}
                    onChange={(e) => setOidcIssuerUrl(e.target.value)}
                    placeholder="https://auth.example.com/application/o/audioseerr"
                  />
                  <p className="text-xs text-muted-foreground">
                    The discovery base — Audioseerr appends{" "}
                    <code className="font-mono">/.well-known/openid-configuration</code>.
                    For Keycloak this includes the realm, e.g.{" "}
                    <code className="font-mono">…/realms/main</code>.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="oidcClientId">Client ID</Label>
                  <Input
                    id="oidcClientId"
                    value={oidcClientId}
                    onChange={(e) => setOidcClientId(e.target.value)}
                    placeholder="From your identity provider"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="oidcClientSecret">Client secret</Label>
                  <Input
                    id="oidcClientSecret"
                    type="password"
                    value={oidcClientSecret}
                    onChange={(e) => {
                      setOidcClientSecret(e.target.value);
                      setOidcSecretEdited(true);
                    }}
                    onFocus={() => {
                      if (!oidcSecretEdited && oidcClientSecret.startsWith("••")) {
                        setOidcClientSecret("");
                      }
                    }}
                    placeholder="Stored encrypted, like the slskd key"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="oidcButtonLabel">Button label</Label>
                  <Input
                    id="oidcButtonLabel"
                    value={oidcButtonLabel}
                    onChange={(e) => setOidcButtonLabel(e.target.value)}
                    placeholder="SSO"
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Register this redirect URI at your provider:{" "}
                <code className="font-mono break-all">{oidcCallbackUrl}</code>.
                SSO changes take effect on the{" "}
                <strong>next server restart</strong> — the login-page button
                appears once Audioseerr has reloaded them.
              </p>
            </CardContent>
          </Card>
        );
      case "storage":
        return <StorageCard storage={storage} />;
      case "external-login":
        return (
          <Card>
            <CardHeader>
              <CardTitle>External login (Plex, Jellyfin)</CardTitle>
              <CardDescription>
                Extra sign-in methods for the login page: Plex.tv accounts via
                Plex&apos;s PIN flow, and username/password accounts on a
                Jellyfin server. External sign-ins are matched to local
                accounts by email and created automatically on first login,
                always as regular users. Both methods are configured with
                environment variables, so this card is read-only — changes
                apply on the next server restart.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <EnvRow label="PLEX_ENABLED" set={externalLogin.plexEnabled} />
              <EnvRow
                label="PLEX_CLIENT_IDENTIFIER"
                set={externalLogin.plexClientIdSet}
              />
              <EnvValueRow
                label="JELLYFIN_SERVER_URL"
                value={externalLogin.jellyfinServerUrl}
              />
              <EnvRow
                label="JELLYFIN_API_KEY"
                set={externalLogin.jellyfinApiKeySet}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Set <code className="font-mono">PLEX_ENABLED=1</code> to add a
                “Sign in with Plex” button. Plex identifies this server with a
                stable client id derived from AUDIOSEERR_SECRET unless{" "}
                <code className="font-mono">PLEX_CLIENT_IDENTIFIER</code> is
                set. Set <code className="font-mono">JELLYFIN_SERVER_URL</code>{" "}
                (e.g. <code className="font-mono">http://jellyfin:8096</code>)
                to add the Jellyfin sign-in form;{" "}
                <code className="font-mono">JELLYFIN_API_KEY</code> is optional.
                Jellyfin users without an email on their server get a{" "}
                <code className="font-mono">&lt;username&gt;@jellyfin.local</code>{" "}
                address for account matching.
              </p>
            </CardContent>
          </Card>
        );
      case "youtube":
        return (
          <IntegrationCard
            provider="youtube"
            name="YouTube"
            description="Powers the in-app watch player — resolves a track to an embeddable YouTube video. Without a key, the watch button falls back to opening a YouTube search in a new tab."
            connected={env.youtube}
          >
            <div className="flex flex-col gap-3">
              <EnvRow label="YOUTUBE_API_KEY" set={env.youtube} />
              <p className="text-xs text-muted-foreground">
                Read-only — create a key in the{" "}
                <a
                  href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline"
                >
                  Google Cloud Console
                </a>{" "}
                (YouTube Data API v3), set it as the{" "}
                <code className="font-mono">YOUTUBE_API_KEY</code> environment
                variable, and restart the container.
              </p>
            </div>
          </IntegrationCard>
        );
    }
  }

  // Non-admins only manage their own per-user integrations (Spotify); the
  // server settings form and its actions are admin-only.
  if (!isAdmin) {
    return <SpotifyIntegrationCard {...spotify} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Server secrets are auto-generated by the Docker entrypoint, so a
          healthy install has nothing to show. Only speak up when one is
          missing (e.g. running outside Docker without env vars). */}
      {(!env.authSecret || !env.audioseerrSecret) && (
        <div className="flex flex-col gap-2 rounded-2xl bg-pastel-red p-4 text-ink">
          <p className="flex items-center gap-2 text-sm font-bold">
            <TriangleAlert className="size-4" />
            Server secrets not configured
          </p>
          <p className="text-sm">
            AUTH_SECRET signs login sessions and AUDIOSEERR_SECRET encrypts the
            API keys stored in the database. The Docker image generates both
            automatically on first boot — if you run Audioseerr another way,
            set them in the environment and restart.
          </p>
          <EnvRow label="AUTH_SECRET" set={env.authSecret} />
          <EnvRow label="AUDIOSEERR_SECRET" set={env.audioseerrSecret} />
        </div>
      )}
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
          className="flex w-fit gap-1 rounded-full bg-surface-2 p-1"
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-colors",
                tab === id
                  ? "bg-pastel-yellow text-ink"
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
            <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-foreground/15 py-12 text-center">
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
          <div className="rounded-xl bg-pastel-red px-3 py-2 text-sm text-ink">
            {error}
          </div>
        )}

        <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-2xl bg-card p-3">
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
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
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
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dot)} />
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
    <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5">
      <code className="font-mono text-xs">{label}</code>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium",
          set ? "text-pastel-mint" : "text-muted-foreground",
        )}
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            set ? "bg-pastel-mint" : "bg-muted-foreground/60",
          )}
        />
        {set ? "set" : "not set"}
      </span>
    </div>
  );
}

// Like EnvRow, but for non-secret values worth showing verbatim (e.g. the
// Jellyfin server URL) rather than as a set/not-set flag.
function EnvValueRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-2 px-3 py-2.5">
      <code className="font-mono text-xs">{label}</code>
      {value ? (
        <code className="font-mono text-xs break-all text-pastel-mint">
          {value}
        </code>
      ) : (
        <span className="text-xs text-muted-foreground">not set</span>
      )}
    </div>
  );
}
