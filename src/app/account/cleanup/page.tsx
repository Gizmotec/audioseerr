import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { planLibraryRelease } from "@/lib/libraryReconcile";
import { isSetupComplete } from "@/lib/settings";
import { CleanupClient } from "./CleanupClient";

export const dynamic = "force-dynamic";

export default async function LibraryCleanupPage() {
  if (!(await isSetupComplete())) redirect("/setup");
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // Dry run — nothing is touched until the page asks for it.
  const plan = await planLibraryRelease(userId, { includeManual: false });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/account"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Account
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Tidy library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Auto-downloading a featured playlist fetches its picks each week, and
          until recently nothing let go of the ones that rotated out. This finds
          tracks nothing points at any more — not liked, not in one of your
          playlists, not in a playlist you auto-download.
        </p>
      </header>

      <CleanupClient initialPlan={plan} />
    </main>
  );
}
