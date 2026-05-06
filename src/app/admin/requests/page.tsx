import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";
import { AdminRequestRow } from "./AdminRequestRow";
import { SyncNowButton } from "./SyncNowButton";

export const dynamic = "force-dynamic";

export default async function AdminRequestsPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as { role?: string }).role !== "ADMIN") {
    redirect("/home");
  }

  const [pending, recent] = await Promise.all([
    prisma.request.findMany({
      where: { status: "PENDING" },
      orderBy: { requestedAt: "asc" },
      include: { requestedBy: { select: { username: true } } },
    }),
    prisma.request.findMany({
      where: { status: { not: "PENDING" } },
      orderBy: { requestedAt: "desc" },
      take: 20,
      include: { requestedBy: { select: { username: true } } },
    }),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Request queue</h1>
          <p className="text-sm text-muted-foreground">
            Approve or decline incoming requests. Approving sends the artist to Lidarr.
          </p>
        </div>
        <SyncNowButton />
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Pending {pending.length > 0 ? `(${pending.length})` : ""}
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            No pending requests.
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {pending.map((r) => (
              <AdminRequestRow
                key={r.id}
                request={{
                  id: r.id,
                  type: r.type,
                  mbid: r.mbid,
                  title: r.title,
                  artistName: r.artistName,
                  coverUrl: r.coverUrl,
                  albumMbid: r.albumMbid,
                  albumTitle: r.albumTitle,
                  downloadTitle: r.downloadTitle,
                  status: r.status,
                  declineReason: r.declineReason,
                  requestedBy: r.requestedBy.username,
                  requestedAt: r.requestedAt.toISOString(),
                }}
                isPending
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Recent activity
        </h2>
        {recent.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nothing here yet.
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {recent.map((r) => (
              <AdminRequestRow
                key={r.id}
                request={{
                  id: r.id,
                  type: r.type,
                  mbid: r.mbid,
                  title: r.title,
                  artistName: r.artistName,
                  coverUrl: r.coverUrl,
                  albumMbid: r.albumMbid,
                  albumTitle: r.albumTitle,
                  downloadTitle: r.downloadTitle,
                  status: r.status,
                  declineReason: r.declineReason,
                  requestedBy: r.requestedBy.username,
                  requestedAt: r.requestedAt.toISOString(),
                }}
                isPending={false}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
