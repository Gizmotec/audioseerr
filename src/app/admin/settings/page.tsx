import { statfs } from "node:fs/promises";
import { ArrowLeft } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UsersAdminClient } from "@/app/admin/users/UsersAdminClient";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getSettings, isSetupComplete, type SettingsView } from "@/lib/settings";
import { applyPathMap, parsePathMap } from "@/lib/streaming";
import { cn } from "@/lib/utils";
import { SettingsForm, type StorageStats } from "./SettingsForm";

export const dynamic = "force-dynamic";

type Tab = "settings" | "users";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    tab?: string;
    section?: string;
    connected?: string;
    error?: string;
    reason?: string;
  }>;
}) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";
  const currentUserId = (session.user as { id?: string }).id ?? "";

  const params = (await searchParams) ?? {};
  const tab: Tab = isAdmin && params.tab === "users" ? "users" : "settings";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          {!isAdmin
            ? "Connect your Spotify account to import playlists."
            : tab === "users"
              ? "Invite people to your server and decide whose requests skip approval."
              : "Integrations, library playback, and system preferences. Changes apply immediately."}
        </p>
      </header>

      {isAdmin && (
        <div className="mb-6 flex gap-1 border-b border-border">
          <TabLink href="/admin/settings" label="Settings" active={tab === "settings"} />
          <TabLink href="/admin/settings?tab=users" label="Users" active={tab === "users"} />
        </div>
      )}

      {tab === "users" ? (
        <UsersTab currentUserId={currentUserId} />
      ) : (
        <SettingsTab
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          section={params.section}
          oauth={{
            connected: params.connected === "1",
            error: params.error ?? null,
            reason: params.reason ?? null,
          }}
        />
      )}
    </main>
  );
}

function TabLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

async function SettingsTab({
  currentUserId,
  isAdmin,
  section,
  oauth,
}: {
  currentUserId: string;
  isAdmin: boolean;
  section?: string;
  oauth: { connected: boolean; error: string | null; reason: string | null };
}) {
  const [settings, user] = await Promise.all([
    getSettings(),
    prisma.user.findUnique({
      where: { id: currentUserId },
      select: { spotifyAccessToken: true, spotifyClientId: true },
    }),
  ]);
  const env = {
    youtube: !!process.env.YOUTUBE_API_KEY,
    authSecret: !!process.env.AUTH_SECRET,
    audioseerrSecret: !!process.env.AUDIOSEERR_SECRET,
  };

  // External login (Plex/Jellyfin) is configured in the database via the
  // form below. These flags tell the UI when an environment variable
  // overrides a database setting, so it can say why a toggle/field is being
  // ignored (the env value always wins at boot).
  const externalLoginEnv = {
    plexEnabled: !!process.env.PLEX_ENABLED?.trim(),
    plexClientIdentifier: !!process.env.PLEX_CLIENT_IDENTIFIER?.trim(),
    jellyfinServerUrl: !!process.env.JELLYFIN_SERVER_URL?.trim(),
    jellyfinApiKey: !!process.env.JELLYFIN_API_KEY?.trim(),
  };

  // Derive the redirect URI from the request origin so it matches whatever
  // host the user is actually accessing Audioseerr at. They paste this URI
  // into their Spotify app's redirect-URI list verbatim.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const redirectUri = `${proto}://${host}/api/spotify/callback`;
  const oidcCallbackUrl = `${proto}://${host}/api/auth/callback/oidc`;

  return (
    <SettingsForm
      initial={{
        slskdUrl: settings.slskdUrl ?? "",
        slskdApiKeyMasked: settings.slskdApiKey ? "••••••••" : "",
        slskdDownloadPath: settings.slskdDownloadPath ?? "",
        lastFmApiKey: settings.lastFmApiKey ?? "",
        mediaPathMap: settings.mediaPathMap ?? "",
        preDownloadMixes: settings.preDownloadMixes,
        notificationWebhookUrl: settings.notificationWebhookUrl ?? "",
        lastFmApiSecretMasked: settings.lastFmApiSecret ? "••••••••" : "",
        oidcEnabled: settings.oidcEnabled,
        oidcIssuerUrl: settings.oidcIssuerUrl ?? "",
        oidcClientId: settings.oidcClientId ?? "",
        oidcClientSecretMasked: settings.oidcClientSecret ? "••••••••" : "",
        oidcButtonLabel: settings.oidcButtonLabel,
        plexEnabled: settings.plexEnabled,
        plexClientIdentifier: settings.plexClientIdentifier ?? "",
        jellyfinEnabled: settings.jellyfinEnabled,
        jellyfinServerUrl: settings.jellyfinServerUrl ?? "",
        jellyfinApiKeyMasked: settings.jellyfinApiKey ? "••••••••" : "",
      }}
      oidcCallbackUrl={oidcCallbackUrl}
      env={env}
      externalLoginEnv={externalLoginEnv}
      storage={await getStorageStats(settings)}
      spotify={{
        initialClientId: user?.spotifyClientId ?? "",
        connected: !!user?.spotifyAccessToken,
        redirectUri,
        oauthConnected: oauth.connected,
        oauthError: oauth.error,
        reason: oauth.reason,
      }}
      isAdmin={isAdmin}
      initialTab={section === "integrations" ? "integrations" : "general"}
    />
  );
}

// Disk + library usage for the Storage card. App usage is the sum of tracked
// file sizes; total/free come from statfs on the resolved download root (the
// same path-map bridge streaming uses). Returns reachable:false when no path is
// set or the directory isn't mounted (e.g. dev), so the card can say so.
async function getStorageStats(settings: SettingsView): Promise<StorageStats> {
  const agg = await prisma.downloadedTrack.aggregate({
    _sum: { sizeBytes: true },
  });
  const appBytes = agg._sum.sizeBytes ?? 0;

  const root = settings.slskdDownloadPath
    ? applyPathMap(settings.slskdDownloadPath, parsePathMap(settings.mediaPathMap))
    : null;
  if (!root) return { reachable: false, root: null, total: 0, free: 0, appBytes };

  try {
    const fs = await statfs(root);
    return {
      reachable: true,
      root,
      total: fs.blocks * fs.bsize,
      free: fs.bavail * fs.bsize,
      appBytes,
    };
  } catch {
    return { reachable: false, root, total: 0, free: 0, appBytes };
  }
}

async function UsersTab({ currentUserId }: { currentUserId: string }) {
  const [users, invites] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        autoApproveArtist: true,
        autoApproveAlbum: true,
        autoApproveTrack: true,
        createdAt: true,
      },
    }),
    prisma.invite.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "asc" },
      include: { createdBy: { select: { username: true } } },
    }),
  ]);

  const adminCount = users.filter((u) => u.role === "ADMIN").length;

  return (
    <UsersAdminClient
      currentUserId={currentUserId}
      adminCount={adminCount}
      users={users.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        autoApproveArtist: u.autoApproveArtist,
        autoApproveAlbum: u.autoApproveAlbum,
        autoApproveTrack: u.autoApproveTrack,
        createdAt: u.createdAt.toISOString(),
      }))}
      invites={invites.map((i) => ({
        token: i.token,
        createdByUsername: i.createdBy.username,
        expiresAt: i.expiresAt.toISOString(),
      }))}
    />
  );
}
