import { ArrowLeft, Flag } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Request } from "@prisma/client";
import type { RequestRowData } from "@/app/admin/requests/AdminRequestRow";
import { SyncNowButton } from "@/app/admin/requests/SyncNowButton";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";
import { RequestsClient } from "./RequestsClient";

export const dynamic = "force-dynamic";

// Row caps, per list. The full totals still show in the tab badges (via
// prisma count) and truncated lists say so at the bottom.
const REQUESTED_TAKE = 200;
const DECLINED_TAKE = 50;
const HISTORY_TAKE = 200;

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

const requesterInclude = {
  requestedBy: { select: { username: true } },
} as const;

// Admin: everyone's requests. Waiting approval = the PENDING queue; Requested =
// approved (scanning/waiting on Soulseek) then declined; Downloads = in-flight
// then history.
async function AdminRequestsView() {
  const descNewest = { orderBy: { requestedAt: "desc" as const } };
  const [
    pending,
    approved,
    declined,
    downloading,
    history,
    requestedTotal,
    downloadsTotal,
  ] = await Promise.all([
    prisma.request.findMany({
      where: { status: "PENDING" },
      orderBy: { requestedAt: "asc" },
      include: requesterInclude,
    }),
    prisma.request.findMany({
      where: { status: "APPROVED" },
      take: REQUESTED_TAKE,
      ...descNewest,
      include: requesterInclude,
    }),
    prisma.request.findMany({
      where: { status: "DECLINED" },
      take: DECLINED_TAKE,
      ...descNewest,
      include: requesterInclude,
    }),
    prisma.request.findMany({
      where: { status: "DOWNLOADING" },
      ...descNewest,
      include: requesterInclude,
    }),
    prisma.request.findMany({
      where: { status: { in: ["AVAILABLE", "FAILED"] } },
      take: HISTORY_TAKE,
      ...descNewest,
      include: requesterInclude,
    }),
    prisma.request.count({
      where: { status: { in: ["APPROVED", "DECLINED"] } },
    }),
    prisma.request.count({
      where: { status: { in: ["DOWNLOADING", "AVAILABLE", "FAILED"] } },
    }),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 md:px-6">
      <HomeLink />

      <header className="mt-4 mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Requests</h1>
          <p className="text-sm text-muted-foreground">
            Approve or decline incoming requests. Approving fetches it from
            Soulseek.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/issues"
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Flag className="h-4 w-4" /> Issues
          </Link>
          <SyncNowButton />
        </div>
      </header>

      <RequestsClient
        variant="admin"
        pending={pending.map(toRow)}
        requested={[...approved, ...declined].map(toRow)}
        downloading={downloading.map(toRow)}
        history={history.map(toRow)}
        requestedTotal={requestedTotal}
        downloadsTotal={downloadsTotal}
      />
    </main>
  );
}

// Regular user: just their own requests, split the same way, with unrequest.
async function MyRequestsView({ userId }: { userId: string }) {
  const all = await prisma.request.findMany({
    where: { requestedById: userId },
    orderBy: { requestedAt: "desc" },
  });

  const pending = all.filter((r) => r.status === "PENDING").map(toRow);
  const requested = all
    .filter((r) => r.status === "APPROVED" || r.status === "DECLINED")
    .map(toRow);
  const downloading = all.filter((r) => r.status === "DOWNLOADING").map(toRow);
  const history = all
    .filter((r) => r.status === "AVAILABLE" || r.status === "FAILED")
    .map(toRow);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <HomeLink />

      <header className="mt-4 mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">My requests</h1>
          <p className="text-sm text-muted-foreground">
            Artists, albums, and tracks you&apos;ve asked the admin to add.
          </p>
        </div>
        <Link
          href="/issues"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Flag className="h-4 w-4" /> My reports
        </Link>
      </header>

      <RequestsClient
        variant="user"
        pending={pending}
        requested={requested}
        downloading={downloading}
        history={history}
        requestedTotal={requested.length}
        downloadsTotal={downloading.length + history.length}
      />
    </main>
  );
}

function toRow(
  r: Request & { requestedBy?: { username: string } | null },
): RequestRowData {
  return {
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
    requestedBy: r.requestedBy?.username ?? null,
    requestedAt: r.requestedAt.toISOString(),
    lastSearchedAt: r.lastSearchedAt?.toISOString() ?? null,
  };
}

function HomeLink() {
  return (
    <Link
      href="/home"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> Home
    </Link>
  );
}
