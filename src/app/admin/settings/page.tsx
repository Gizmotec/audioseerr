import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UsersAdminClient } from "@/app/admin/users/UsersAdminClient";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getSettings, isSetupComplete } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

type Tab = "settings" | "users";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as { role?: string }).role !== "ADMIN") {
    redirect("/home");
  }

  const { tab: rawTab } = (await searchParams) ?? {};
  const tab: Tab = rawTab === "users" ? "users" : "settings";

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
          {tab === "users"
            ? "Invite people to your server and decide whose requests skip approval."
            : "Soulseek connection, library paths, and discovery API keys. Changes apply immediately."}
        </p>
      </header>

      <div className="mb-6 flex gap-1 border-b border-border">
        <TabLink href="/admin/settings" label="Settings" active={tab === "settings"} />
        <TabLink href="/admin/settings?tab=users" label="Users" active={tab === "users"} />
      </div>

      {tab === "users" ? (
        <UsersTab currentUserId={(session.user as { id?: string }).id ?? ""} />
      ) : (
        <SettingsTab />
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

async function SettingsTab() {
  const settings = await getSettings();
  const env = {
    youtube: !!process.env.YOUTUBE_API_KEY,
    authSecret: !!process.env.AUTH_SECRET,
    audioseerrSecret: !!process.env.AUDIOSEERR_SECRET,
  };

  return (
    <SettingsForm
      initial={{
        slskdUrl: settings.slskdUrl ?? "",
        slskdApiKeyMasked: settings.slskdApiKey ? "••••••••" : "",
        slskdDownloadPath: settings.slskdDownloadPath ?? "",
        lastFmApiKey: settings.lastFmApiKey ?? "",
        mediaPathMap: settings.mediaPathMap ?? "",
      }}
      env={env}
    />
  );
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
