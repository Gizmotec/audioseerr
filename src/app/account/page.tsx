import { ArrowLeft } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AccountForm } from "./AccountForm";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  connected?: string;
  error?: string;
  reason?: string;
}>;

export default async function AccountPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      spotifyClientId: true,
      spotifyAccessToken: true,
      spotifyTokenExpiresAt: true,
    },
  });

  // Derive the redirect URI from the request origin so it matches whatever
  // host the user is actually accessing Audioseerr at. They paste this URI
  // into their Spotify app's redirect-URI list verbatim.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const redirectUri = `${proto}://${host}/api/spotify/callback`;

  const params = await searchParams;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground">
          Per-user integrations. Other users see and connect their own
          accounts independently.
        </p>
      </header>

      <AccountForm
        initialClientId={user?.spotifyClientId ?? ""}
        connected={!!user?.spotifyAccessToken}
        tokenExpiresAt={user?.spotifyTokenExpiresAt ?? null}
        redirectUri={redirectUri}
        oauthConnected={params.connected === "1"}
        oauthError={params.error ?? null}
        reason={params.reason ?? null}
      />
    </main>
  );
}
