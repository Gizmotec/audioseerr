import { Heart, Home, Inbox, Library, ListMusic, Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export async function Sidebar() {
  const session = await auth();
  if (!session?.user) return null;
  const role = (session.user as { role?: string }).role;

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-background md:flex">
      <div className="border-b border-border px-4 py-5">
        <Link href="/home" className="text-lg font-semibold tracking-tight">
          Audioseerr
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-4">
        <SidebarLink href="/home" icon={Home}>Home</SidebarLink>
        <SidebarLink href="/liked" icon={Heart}>Liked</SidebarLink>
        <SidebarLink href="/playlists" icon={ListMusic}>Playlists</SidebarLink>
        <SidebarLink href="/library" icon={Library}>Library</SidebarLink>
        <SidebarLink href="/requests" icon={Inbox}>My requests</SidebarLink>
        {role === "ADMIN" && (
          <>
            <SidebarLink href="/admin/requests" icon={ShieldCheck}>Queue</SidebarLink>
            <SidebarLink href="/admin/settings" icon={SettingsIcon}>Settings</SidebarLink>
          </>
        )}
      </nav>

      <div className="border-t border-border px-4 py-4">
        <p className="truncate text-xs text-muted-foreground">
          Signed in as <span className="font-mono text-foreground">{session.user.name}</span>
          {role === "ADMIN" ? " · admin" : ""}
        </p>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
          className="mt-2"
        >
          <Button variant="ghost" size="sm" type="submit" className="w-full justify-start px-2">
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      <Icon className="h-4 w-4" /> {children}
    </Link>
  );
}
