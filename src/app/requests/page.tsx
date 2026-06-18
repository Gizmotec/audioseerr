import { ArrowLeft, Disc3, Music2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminRequestRow } from "@/app/admin/requests/AdminRequestRow";
import { SyncNowButton } from "@/app/admin/requests/SyncNowButton";
import { auth } from "@/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { prisma } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";
import { UnrequestButton } from "./UnrequestButton";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";

  if (isAdmin) {
    return <AdminRequestsView />;
  }

  return <MyRequestsView userId={session.user.id} />;
}

// Admin: everyone's requests, with the approval queue first and approve/decline
// inline. This is the former /admin/requests "Queue" folded into Requests.
async function AdminRequestsView() {
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

  const toRow = (r: (typeof pending)[number]) => ({
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
  });

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
          <h1 className="text-2xl font-semibold tracking-tight">Requests</h1>
          <p className="text-sm text-muted-foreground">
            Approve or decline incoming requests. Approving fetches it from Soulseek.
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
              <AdminRequestRow key={r.id} request={toRow(r)} isPending />
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
              <AdminRequestRow key={r.id} request={toRow(r)} isPending={false} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// Regular user: just their own requests, with unrequest.
async function MyRequestsView({ userId }: { userId: string }) {
  const requests = await prisma.request.findMany({
    where: { requestedById: userId },
    orderBy: { requestedAt: "desc" },
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">My requests</h1>
        <p className="text-sm text-muted-foreground">
          Artists, albums, and tracks you&apos;ve asked the admin to add.
        </p>
      </header>

      {requests.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          You haven&apos;t requested anything yet.{" "}
          <Link href="/search" className="underline">
            Find an album
          </Link>{" "}
          to get started.
        </div>
      ) : (
        <ul className="divide-y divide-border/50">
          {requests.map((r) => {
            const href =
              r.type === "TRACK" && r.albumMbid
                ? `/album/${r.albumMbid}`
                : `/album/${r.mbid}`;
            const kind = r.type.toLowerCase();
            return (
              <li key={r.id} className="flex items-center gap-4 py-3">
                <Link
                  href={href}
                  className="flex h-12 w-12 shrink-0 overflow-hidden rounded bg-secondary"
                >
                  {r.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.coverUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                      {r.type === "TRACK" ? (
                        <Music2 className="h-6 w-6" />
                      ) : (
                        <Disc3 className="h-6 w-6" />
                      )}
                    </div>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={href}
                    className="block truncate font-medium hover:underline"
                    title={r.title}
                  >
                    {r.title}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.type === "TRACK" && r.albumTitle
                      ? `${r.artistName} · ${r.albumTitle}`
                      : r.artistName}{" "}
                    · {kind} requested {formatRelative(r.requestedAt)}
                  </p>
                  {r.downloadTitle && (
                    <p className="truncate text-xs text-muted-foreground">
                      Download: {r.downloadTitle}
                    </p>
                  )}
                  {(r.status === "DECLINED" || r.status === "FAILED") &&
                    r.declineReason && (
                    <p className="truncate text-xs text-muted-foreground">
                      {r.status === "FAILED" ? "Failure" : "Reason"}:{" "}
                      {r.declineReason}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <StatusBadge status={r.status} />
                  <UnrequestButton
                    request={{
                      id: r.id,
                      type: r.type,
                      mbid: r.mbid,
                      albumMbid: r.albumMbid,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function formatRelative(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString();
}
