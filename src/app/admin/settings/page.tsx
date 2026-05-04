import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  type LidarrQualityProfile,
  type LidarrRootFolder,
  listQualityProfiles,
  listRootFolders,
} from "@/lib/lidarr";
import { getSettings, isSetupComplete } from "@/lib/settings";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as { role?: string }).role !== "ADMIN") {
    redirect("/home");
  }

  const settings = await getSettings();

  // Best-effort: pre-fetch profiles/root folders so the dropdowns are populated
  // immediately. If Lidarr is unreachable, the form falls back to keeping the
  // currently-saved IDs and lets the user re-probe.
  let profiles: LidarrQualityProfile[] = [];
  let rootFolders: LidarrRootFolder[] = [];
  let lidarrReachable = false;
  if (settings.lidarrUrl && settings.lidarrApiKey) {
    try {
      [profiles, rootFolders] = await Promise.all([
        listQualityProfiles({
          url: settings.lidarrUrl,
          apiKey: settings.lidarrApiKey,
        }),
        listRootFolders({
          url: settings.lidarrUrl,
          apiKey: settings.lidarrApiKey,
        }),
      ]);
      lidarrReachable = true;
    } catch {
      // Surface a soft warning in the form rather than failing the page.
    }
  }

  const env = {
    youtube: !!process.env.YOUTUBE_API_KEY,
    authSecret: !!process.env.AUTH_SECRET,
    audioseerrSecret: !!process.env.AUDIOSEERR_SECRET,
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Lidarr connection, library paths, registration policy, and discovery
          API keys. Changes apply immediately — no restart needed.
        </p>
      </header>

      <SettingsForm
        initial={{
          lidarrUrl: settings.lidarrUrl ?? "",
          lidarrApiKeyMasked: settings.lidarrApiKey ? "••••••••" : "",
          lidarrDefaultProfileId: settings.lidarrDefaultProfileId ?? null,
          lidarrRootFolderPath: settings.lidarrRootFolderPath ?? "",
          lastFmApiKey: settings.lastFmApiKey ?? "",
          mediaPathMap: settings.mediaPathMap ?? "",
          registrationMode: settings.registrationMode,
          requireApproval: settings.requireApproval,
        }}
        profiles={profiles}
        rootFolders={rootFolders}
        lidarrReachable={lidarrReachable}
        env={env}
      />
    </main>
  );
}
