import { ArrowLeft, Download, KeyRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ScrobblingSection } from "@/components/scrobble/ScrobblingSection";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { getLastFmAppCredentials } from "@/lib/scrobble";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  // Legacy shim: the per-user Spotify flow used to live here and its OAuth
  // callbacks still point at /account. Forward those (and old bookmarks) to
  // the settings page's Integrations tab. Scrobbling's own callback params
  // (scrobbleConnected/scrobbleError) deliberately use different names.
  if (params.connected || params.error || params.reason) {
    const qs = new URLSearchParams();
    qs.set("section", "integrations");
    for (const key of ["connected", "error", "reason"]) {
      const value = params[key];
      if (value) qs.set(key, value);
    }
    redirect(`/admin/settings?${qs.toString()}`);
  }

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, lastFmCreds] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        lastfmUsername: true,
        lastfmSessionKey: true,
        scrobbleLastfm: true,
        listenbrainzUsername: true,
        listenbrainzToken: true,
        scrobbleListenbrainz: true,
      },
    }),
    getLastFmAppCredentials(),
  ]);
  if (!user) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground">
          Your personal integrations and listening preferences.
        </p>
      </header>

      <ScrobblingSection
        listenbrainz={{
          connected: !!user.listenbrainzToken,
          username: user.listenbrainzUsername,
          enabled: user.scrobbleListenbrainz,
        }}
        lastfm={{
          connected: !!user.lastfmSessionKey,
          username: user.lastfmUsername,
          enabled: user.scrobbleLastfm,
          configured: !!lastFmCreds,
        }}
        scrobbleConnected={params.scrobbleConnected ?? null}
        scrobbleError={params.scrobbleError ?? null}
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> API keys
          </CardTitle>
          <CardDescription>
            Personal keys for the Audioseerr REST API — use them from scripts,
            dashboards, and other apps. Docs: docs/api.md in the repo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/account/api-keys"
            className={buttonVariants({ variant: "outline" })}
          >
            Manage API keys
          </Link>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" /> Data export
          </CardTitle>
          <CardDescription>
            Download everything Audioseerr stores about you — profile, likes,
            playlists, play history, requests, and library — as a JSON file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Plain anchor, not Link: the route streams an attachment, so the
              browser must handle it as a download, not client navigation. */}
          <a
            href="/account/export"
            className={buttonVariants({ variant: "outline" })}
          >
            <Download className="h-4 w-4" /> Download JSON
          </a>
        </CardContent>
      </Card>
    </main>
  );
}
