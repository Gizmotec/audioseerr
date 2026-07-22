import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { getJellyfinAuthConfig } from "@/lib/jellyfin";
import { getOidcBootConfig, OIDC_PROVIDER_ID } from "@/lib/oidc";
import { getPlexAuthConfig } from "@/lib/plex";
import { isSetupComplete } from "@/lib/settings";
import { JellyfinLoginForm } from "./JellyfinLoginForm";
import { LoginForm } from "./LoginForm";
import { PlexLoginButton } from "./PlexLoginButton";

export const dynamic = "force-dynamic";

async function signInWithOidc() {
  "use server";
  await signIn(OIDC_PROVIDER_ID, { redirectTo: "/home" });
}

// Auth.js appends ?error=<code> to the sign-in page when an OAuth/OIDC
// attempt fails (e.g. AccessDenied when the IdP profile has no email claim).
function ssoErrorMessage(code: string): string {
  if (code === "AccessDenied") {
    return "SSO sign-in was denied — the identity provider didn't return an email address, or access was rejected.";
  }
  return "SSO sign-in failed. Try again, or use your username and password.";
}

function OrDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-background px-2 text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (session?.user) {
    redirect("/home");
  }

  // The external sign-in buttons mirror the provider registrations in
  // src/auth.ts: OIDC reads the boot-time DB snapshot, Plex/Jellyfin read the
  // same env-based config the providers were built from, so a button appears
  // exactly when its provider is live (changes apply on restart).
  const oidc = getOidcBootConfig();
  const plex = getPlexAuthConfig();
  const jellyfin = getJellyfinAuthConfig();
  const error = (await searchParams)?.error;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Audioseerr</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>

        {error && (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {ssoErrorMessage(error)}
          </p>
        )}

        {(oidc || plex) && (
          <div className="mb-4 space-y-4">
            {oidc && (
              <form action={signInWithOidc}>
                <Button type="submit" variant="outline" className="w-full">
                  {oidc.buttonLabel}
                </Button>
              </form>
            )}
            {plex && <PlexLoginButton />}
            <OrDivider />
          </div>
        )}

        <LoginForm />

        {jellyfin && (
          <div className="mt-6 space-y-4">
            <OrDivider label="or" />
            <JellyfinLoginForm />
          </div>
        )}
      </div>
    </main>
  );
}
