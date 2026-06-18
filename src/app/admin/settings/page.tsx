import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
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
          Soulseek connection, library paths, and discovery API keys. Changes
          apply immediately — no restart needed.
        </p>
      </header>

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
    </main>
  );
}
