import { ArrowLeft, Disc3, Music2, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Request } from "@prisma/client";
import { AdminRequestRow } from "@/app/admin/requests/AdminRequestRow";
import { SyncNowButton } from "@/app/admin/requests/SyncNowButton";
import { auth } from "@/auth";
import { DownloadProgressBar } from "@/components/DownloadProgressBar";
import { DownloadsProgressProvider } from "@/components/DownloadsProgressProvider";
import { StatusBadge } from "@/components/StatusBadge";
import { prisma } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";
import { RequestTabs } from "./RequestTabs";
import { UnrequestButton } from "./UnrequestButton";

export const dynamic = "force-dynamic";

// A request belongs to the Downloads tab once a download has actually started
// (or finished/failed); everything else — pending approval, approved & still
// searching Soulseek, declined — stays in the Requests tab.
const DOWNLOAD_STATUSES = ["DOWNLOADING", "AVAILABLE", "FAILED"] as const;

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

// Admin: everyone's requests. Requests tab holds the approval queue + still-
// searching/declined rows; Downloads tab holds in-flight + finished downloads.
async function AdminRequestsView() {
  const [pending, requested, downloads] = await Promise.all([
    prisma.request.findMany({
      where: { status: "PENDING" },
      orderBy: { requestedAt: "asc" },
      include: { requestedBy: { select: { username: true } } },
    }),
    prisma.request.findMany({
      where: { status: { in: ["APPROVED", "DECLINED"] } },
      orderBy: { requestedAt: "desc" },
      take: 50,
      include: { requestedBy: { select: { username: true } } },
    }),
    prisma.request.findMany({
      where: { status: { in: [...DOWNLOAD_STATUSES] } },
      orderBy: { requestedAt: "desc" },
      take: 50,
      include: { requestedBy: { select: { username: true } } },
    }),
  ]);

  const hasActive = downloads.some((r) => r.status === "DOWNLOADING");

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

  const requestsPanel = (
    <>
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Pending {pending.length > 0 ? `(${pending.length})` : ""}
        </h2>
        {pending.length === 0 ? (
          <EmptyHint>No pending requests.</EmptyHint>
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
          Approved &amp; declined
        </h2>
        {requested.length === 0 ? (
          <EmptyHint>Nothing here yet.</EmptyHint>
        ) : (
          <ul className="divide-y divide-border/50">
            {requested.map((r) => (
              <AdminRequestRow key={r.id} request={toRow(r)} isPending={false} />
            ))}
          </ul>
        )}
      </section>
    </>
  );

  const downloadsPanel =
    downloads.length === 0 ? (
      <EmptyHint>
        Nothing downloading yet. Approved requests land here once a match is
        found on Soulseek.
      </EmptyHint>
    ) : (
      <DownloadsProgressProvider enabled={hasActive}>
        <ul className="divide-y divide-border/50">
          {downloads.map((r) => (
            <AdminRequestRow key={r.id} request={toRow(r)} isPending={false} />
          ))}
        </ul>
      </DownloadsProgressProvider>
    );

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
        <SyncNowButton />
      </header>

      <RequestTabs
        requests={requestsPanel}
        downloads={downloadsPanel}
        requestsCount={pending.length + requested.length}
        downloadsCount={downloads.length}
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
  const downloadSet = new Set<string>(DOWNLOAD_STATUSES);
  const requests = all.filter((r) => !downloadSet.has(r.status));
  const downloads = all.filter((r) => downloadSet.has(r.status));
  const hasActive = downloads.some((r) => r.status === "DOWNLOADING");

  const requestsPanel =
    requests.length === 0 ? (
      <EmptyHint>
        You haven&apos;t requested anything yet.{" "}
        <Link href="/search" className="underline">
          Find an album
        </Link>{" "}
        to get started.
      </EmptyHint>
    ) : (
      <ul className="divide-y divide-border/50">{requests.map(userRow)}</ul>
    );

  const downloadsPanel =
    downloads.length === 0 ? (
      <EmptyHint>
        Nothing downloading yet. Your requests appear here once a match is found
        and the download starts.
      </EmptyHint>
    ) : (
      <DownloadsProgressProvider enabled={hasActive}>
        <ul className="divide-y divide-border/50">{downloads.map(userRow)}</ul>
      </DownloadsProgressProvider>
    );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <HomeLink />

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">My requests</h1>
        <p className="text-sm text-muted-foreground">
          Artists, albums, and tracks you&apos;ve asked the admin to add.
        </p>
      </header>

      <RequestTabs
        requests={requestsPanel}
        downloads={downloadsPanel}
        requestsCount={requests.length}
        downloadsCount={downloads.length}
      />
    </main>
  );
}

// One row in the user's Requests/Downloads lists.
function userRow(r: Request) {
  const href =
    r.type === "TRACK" && r.albumMbid
      ? `/album/${r.albumMbid}`
      : `/album/${r.mbid}`;
  const kind = r.type.toLowerCase();
  // Approved track with no download started yet = still hunting on Soulseek.
  const searching = r.status === "APPROVED";

  return (
    <li key={r.id} className="flex items-center gap-4 py-3">
      <Link
        href={href}
        className="flex h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 border-ink bg-secondary"
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
        {searching && (
          <p className="flex items-center gap-1.5 truncate text-xs text-pastel-sky">
            <Search className="h-3 w-3 shrink-0 animate-pulse" />
            {r.declineReason ?? "Searching Soulseek for a match…"}
          </p>
        )}
        {r.downloadTitle && !searching && (
          <p className="truncate text-xs text-muted-foreground">
            Download: {r.downloadTitle}
          </p>
        )}
        {(r.status === "DECLINED" || r.status === "FAILED") &&
          r.declineReason && (
            <p className="truncate text-xs text-muted-foreground">
              {r.status === "FAILED" ? "Failure" : "Reason"}: {r.declineReason}
            </p>
          )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <StatusBadge status={r.status} />
        {r.status === "DOWNLOADING" && <DownloadProgressBar requestId={r.id} />}
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

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-ink/40 bg-card p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
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
