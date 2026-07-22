import { ArrowLeft, Flag } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import {
  issueStatusBadgeVariant,
  issueStatusLabel,
  issueTypeLabel,
} from "@/lib/issues";
import { listMyIssuesAction, type IssueListRow } from "@/lib/actions/issues";
import { isSetupComplete } from "@/lib/settings";

export const dynamic = "force-dynamic";

// User-facing "My reports": every issue the signed-in user has filed from the
// album pages, newest first, with the admin's resolution note once handled.
export default async function IssuesPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const result = await listMyIssuesAction();
  const issues = result.ok ? result.issues : [];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">My reports</h1>
        <p className="text-sm text-muted-foreground">
          Problems you&apos;ve flagged on albums and tracks. Report new ones
          with the <Flag className="inline h-3.5 w-3.5 align-[-2px]" /> button
          on any album page.
        </p>
      </header>

      {!result.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      ) : issues.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-foreground/15 bg-card p-10 text-center text-sm text-muted-foreground">
          You haven&apos;t reported any problems yet.
        </div>
      ) : (
        <ul className="divide-y divide-border/50">
          {issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
        </ul>
      )}
    </main>
  );
}

function IssueRow({ issue }: { issue: IssueListRow }) {
  const context = [issue.artistName, issue.albumTitle]
    .filter(Boolean)
    .join(" · ");
  const level = issue.trackKey ? "track" : "album";

  return (
    <li className="flex items-start gap-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {issue.albumMbid ? (
            <Link
              href={`/album/${issue.albumMbid}`}
              className="truncate font-medium hover:underline"
              title={issue.title}
            >
              {issue.title}
            </Link>
          ) : (
            <span className="truncate font-medium" title={issue.title}>
              {issue.title}
            </span>
          )}
          <Badge variant="secondary">{issueTypeLabel(issue.type)}</Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {context} · {level}-level report ·{" "}
          {formatRelative(new Date(issue.createdAt))}
        </p>
        {issue.description && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {issue.description}
          </p>
        )}
        {issue.status !== "OPEN" && issue.resolverNote && (
          <p className="mt-1 text-sm">
            <span className="font-medium">Admin:</span> {issue.resolverNote}
          </p>
        )}
      </div>
      <Badge variant={issueStatusBadgeVariant(issue.status)}>
        {issueStatusLabel(issue.status)}
      </Badge>
    </li>
  );
}

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString();
}
