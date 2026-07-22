import { ArrowLeft, Bell } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listNotifications } from "@/lib/actions/notifications";
import { isSetupComplete } from "@/lib/settings";
import { MarkAllReadButton } from "./MarkAllReadButton";
import { NotificationRow } from "./NotificationRow";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const notifications = await listNotifications();
  const hasUnread = notifications.some((n) => n.readAt === null);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground">
            What happened to your requests — approvals, declines, and finished
            downloads.
          </p>
        </div>
        {hasUnread && <MarkAllReadButton />}
      </header>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-foreground/15 bg-card p-10 text-center">
          <Bell className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No notifications yet. We&apos;ll tell you here when something
            happens to your requests.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/50">
          {notifications.map((n) => (
            <NotificationRow key={n.id} item={n} />
          ))}
        </ul>
      )}
    </main>
  );
}
