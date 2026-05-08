import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";
import { UsersAdminClient } from "./UsersAdminClient";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as { role?: string }).role !== "ADMIN") {
    redirect("/home");
  }
  const currentUserId = (session.user as { id?: string }).id ?? "";

  const [users, invites] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        autoApproveArtist: true,
        autoApproveAlbum: true,
        autoApproveTrack: true,
        createdAt: true,
      },
    }),
    prisma.invite.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "asc" },
      include: { createdBy: { select: { username: true } } },
    }),
  ]);

  const adminCount = users.filter((u) => u.role === "ADMIN").length;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Invite people to your server and decide whose requests skip the approval queue.
        </p>
      </header>

      <UsersAdminClient
        currentUserId={currentUserId}
        adminCount={adminCount}
        users={users.map((u) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          role: u.role,
          autoApproveArtist: u.autoApproveArtist,
          autoApproveAlbum: u.autoApproveAlbum,
          autoApproveTrack: u.autoApproveTrack,
          createdAt: u.createdAt.toISOString(),
        }))}
        invites={invites.map((i) => ({
          token: i.token,
          createdByUsername: i.createdBy.username,
          expiresAt: i.expiresAt.toISOString(),
        }))}
      />
    </main>
  );
}
