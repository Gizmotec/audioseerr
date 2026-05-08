import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ token: string }>;

export default async function InvitePage({ params }: { params: RouteParams }) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }

  const { token } = await params;
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { createdBy: { select: { username: true } } },
  });

  const session = await auth();
  if (session?.user) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Card>
            <CardHeader>
              <CardTitle>Already signed in</CardTitle>
              <CardDescription>
                You&apos;re signed in as{" "}
                <span className="font-mono">{session.user.name}</span>. Sign out first
                if you want to redeem this invite for a new account.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Link href="/home" className="flex-1">
                <Button variant="secondary" className="w-full">
                  Go home
                </Button>
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: `/invite/${token}` });
                }}
                className="flex-1"
              >
                <Button type="submit" className="w-full">
                  Sign out
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    const reason = !invite
      ? "This invite link doesn't exist."
      : invite.usedAt
        ? "This invite has already been used."
        : "This invite has expired.";
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Card>
            <CardHeader>
              <CardTitle>Invite unavailable</CardTitle>
              <CardDescription>{reason}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/login">
                <Button variant="secondary" className="w-full">
                  Go to sign in
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Audioseerr</h1>
          <p className="text-sm text-muted-foreground">
            Invited by{" "}
            <span className="font-mono">{invite.createdBy.username}</span>
          </p>
        </div>
        <RegisterForm token={token} />
      </div>
    </main>
  );
}
