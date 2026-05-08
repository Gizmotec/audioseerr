import { UserCog } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";
import { PreferencesPanel } from "./PreferencesPanel";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [user, playEventCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, email: true, personalizedSuggestionsEnabled: true },
    }),
    prisma.playEvent.count({ where: { userId } }),
  ]);
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 md:px-6">
      <header className="flex flex-col gap-2 border-b border-border pb-8">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <UserCog className="h-3.5 w-3.5" />
          Preferences
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Your account
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-mono text-foreground">{user.username}</span>{" · "}
          {user.email}
        </p>
      </header>

      <PreferencesPanel
        personalizationEnabled={user.personalizedSuggestionsEnabled}
        playEventCount={playEventCount}
      />
    </main>
  );
}
