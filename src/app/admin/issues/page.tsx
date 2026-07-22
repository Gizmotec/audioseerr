import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isIssueStatus, type IssueStatusValue } from "@/lib/issues";
import { isSetupComplete } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { AdminIssueRow, type AdminIssueRowData } from "./AdminIssueRow";

export const dynamic = "force-dynamic";

// Row cap for the unfiltered listings; open issues are never capped.
const ISSUES_TAKE = 200;

type Filter = IssueStatusValue | "ALL";

// Admin triage for user-filed problem reports. Default view puts the OPEN
// queue first (oldest waiting longest, like the requests queue) followed by
// everything already handled; ?status= narrows to a single bucket.
export default async function AdminIssuesPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";
  if (!isAdmin) redirect("/issues");

  const params = (await searchParams) ?? {};
  const filter: Filter =
    params.status === "ALL"
      ? "ALL"
      : params.status && isIssueStatus(params.status)
        ? params.status
        : "OPEN";

  const reporterInclude = {
    reporter: { select: { username: true } },
  } as const;

  const [open, handled, all, openCount] = await Promise.all([
    filter === "OPEN"
      ? prisma.issue.findMany({
          where: { status: "OPEN" },
          orderBy: { createdAt: "asc" },
          include: reporterInclude,
        })
      : Promise.resolve([]),
    filter === "OPEN"
      ? prisma.issue.findMany({
          where: { status: { in: ["RESOLVED", "CLOSED"] } },
          orderBy: { createdAt: "desc" },
          take: ISSUES_TAKE,
          include: reporterInclude,
        })
      : Promise.resolve([]),
    filter !== "OPEN"
      ? prisma.issue.findMany({
          where: filter === "ALL" ? {} : { status: filter },
          orderBy: { createdAt: "desc" },
          take: ISSUES_TAKE,
          include: reporterInclude,
        })
      : Promise.resolve([]),
    prisma.issue.count({ where: { status: "OPEN" } }),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Issues</h1>
        <p className="text-sm text-muted-foreground">
          Problem reports from your users — wrong matches, bad metadata,
          playback trouble.
        </p>
      </header>

      <div className="mb-6 flex gap-1 border-b border-border">
        <FilterLink
          href="/admin/issues"
          label={`Open${openCount > 0 ? ` (${openCount})` : ""}`}
          active={filter === "OPEN"}
        />
        <FilterLink
          href="/admin/issues?status=RESOLVED"
          label="Resolved"
          active={filter === "RESOLVED"}
        />
        <FilterLink
          href="/admin/issues?status=CLOSED"
          label="Closed"
          active={filter === "CLOSED"}
        />
        <FilterLink
          href="/admin/issues?status=ALL"
          label="All"
          active={filter === "ALL"}
        />
      </div>

      {filter === "OPEN" ? (
        <>
          <section>
            {open.length === 0 ? (
              <EmptyHint>No open issues. 🎉</EmptyHint>
            ) : (
              <ul className="divide-y divide-border/50">
                {open.map((i) => (
                  <AdminIssueRow key={i.id} issue={toRow(i)} />
                ))}
              </ul>
            )}
          </section>
          {handled.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Resolved &amp; closed
              </h2>
              <ul className="divide-y divide-border/50">
                {handled.map((i) => (
                  <AdminIssueRow key={i.id} issue={toRow(i)} />
                ))}
              </ul>
            </section>
          )}
        </>
      ) : all.length === 0 ? (
        <EmptyHint>Nothing here.</EmptyHint>
      ) : (
        <ul className="divide-y divide-border/50">
          {all.map((i) => (
            <AdminIssueRow key={i.id} issue={toRow(i)} />
          ))}
        </ul>
      )}
    </main>
  );
}

function FilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-foreground/15 bg-card p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

type IssueWithReporter = Awaited<
  ReturnType<typeof prisma.issue.findMany<{ include: { reporter: { select: { username: true } } } }>>
>[number];

function toRow(i: IssueWithReporter): AdminIssueRowData {
  return {
    id: i.id,
    type: i.type,
    status: i.status,
    title: i.title,
    description: i.description,
    artistName: i.artistName,
    albumTitle: i.albumTitle,
    albumMbid: i.albumMbid,
    trackKey: i.trackKey,
    resolverNote: i.resolverNote,
    reporter: i.reporter?.username ?? null,
    createdAt: i.createdAt.toISOString(),
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
  };
}
