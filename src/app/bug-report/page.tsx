import { ArrowLeft, Bug, ClipboardList } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isSetupComplete } from "@/lib/settings";
import { BugReportForm } from "./BugReportForm";

export const dynamic = "force-dynamic";

export default async function BugReportPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-8 grid gap-5 border-b border-border pb-8 md:grid-cols-[minmax(0,1fr)_18rem] md:items-end">
        <div className="max-w-2xl space-y-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <Bug className="h-3.5 w-3.5" />
            Bug report
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Tell us what broke.
          </h1>
          <p className="text-sm leading-6 text-muted-foreground md:text-base">
            Capture the details a maintainer needs: where it happened, what you
            expected, and what Audioseerr did instead.
          </p>
        </div>
        <div className="rounded-md border border-border bg-secondary/20 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            Local draft only
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Submitting this form does not create a ticket, email anyone, or
            write to the database yet.
          </p>
        </div>
      </header>

      <Card className="rounded-md">
        <CardHeader>
          <CardTitle>Report details</CardTitle>
          <CardDescription>
            Keep it concise, but include enough context to reproduce the issue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BugReportForm />
        </CardContent>
      </Card>
    </main>
  );
}
