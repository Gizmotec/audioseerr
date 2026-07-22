import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { getOidcBootConfig, OIDC_PROVIDER_ID } from "@/lib/oidc";
import { isSetupComplete } from "@/lib/settings";
import { LoginForm } from "./LoginForm";

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

  // The SSO button mirrors the provider registration in src/auth.ts: both
  // read the same boot-time snapshot, so the button appears exactly when the
  // OIDC provider is live (SSO setting changes apply on restart).
  const oidc = getOidcBootConfig();
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

        {oidc && (
          <div className="mb-4 space-y-4">
            <form action={signInWithOidc}>
              <Button type="submit" variant="outline" className="w-full">
                {oidc.buttonLabel}
              </Button>
            </form>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  or
                </span>
              </div>
            </div>
          </div>
        )}

        <LoginForm />
      </div>
    </main>
  );
}
