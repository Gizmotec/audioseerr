import {
  Compass,
  Heart,
  Home,
  Inbox,
  Library,
  ListMusic,
  LogOut,
  Settings as SettingsIcon,
  User,
} from "lucide-react";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { SidebarLink } from "@/components/SidebarLink";
import { SidebarToggle } from "@/components/SidebarToggle";
import { Button } from "@/components/ui/button";

export async function Sidebar() {
  const session = await auth();
  if (!session?.user) return null;
  const role = (session.user as { role?: string }).role;

  return (
    <aside className="sidebar sticky top-0 hidden h-screen shrink-0 flex-col border-r border-foreground/10 bg-sidebar md:flex">
      <div className="sidebar-header flex items-center justify-between px-5 py-6">
        <Link
          href="/home"
          className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-pastel-pink text-ink">
            ♪
          </span>
          <span className="sidebar-wordmark">Audioseerr</span>
        </Link>
        <SidebarToggle />
      </div>

      <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2">
        <SidebarLink
          href="/discover"
          accent="sky"
          icon={<Compass className="h-3.5 w-3.5" />}
        >
          Discover
        </SidebarLink>
        <SidebarLink
          href="/home"
          accent="pink"
          icon={<Home className="h-3.5 w-3.5" />}
        >
          Home
        </SidebarLink>
        <SidebarLink
          href="/liked"
          accent="red"
          icon={<Heart className="h-3.5 w-3.5" />}
        >
          Liked
        </SidebarLink>
        <SidebarLink
          href="/playlists"
          accent="lavender"
          icon={<ListMusic className="h-3.5 w-3.5" />}
        >
          Playlists
        </SidebarLink>
        <SidebarLink
          href="/library"
          accent="mint"
          icon={<Library className="h-3.5 w-3.5" />}
        >
          Library
        </SidebarLink>
        <SidebarLink
          href="/requests"
          accent="yellow"
          icon={<Inbox className="h-3.5 w-3.5" />}
        >
          Requests
        </SidebarLink>
        {role === "ADMIN" && (
          <SidebarLink
            href="/admin/settings"
            accent="sky"
            icon={<SettingsIcon className="h-3.5 w-3.5" />}
          >
            Settings
          </SidebarLink>
        )}
      </nav>

      <div className="border-t border-foreground/10 px-5 py-4">
        <p className="sidebar-footer-note truncate text-xs text-muted-foreground">
          Signed in as{" "}
          <span className="font-mono font-bold text-foreground">
            {session.user.name}
          </span>
          {role === "ADMIN" ? " · admin" : ""}
        </p>
        <Link
          href="/admin/settings?section=integrations"
          className="sidebar-footer-link mt-2 flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <User className="h-4 w-4 shrink-0" />
          <span className="sidebar-label">Integrations</span>
        </Link>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
          className="mt-1"
        >
          <Button
            variant="ghost"
            size="sm"
            type="submit"
            className="sidebar-footer-link w-full justify-start px-3"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="sidebar-label">Sign out</span>
          </Button>
        </form>
      </div>
    </aside>
  );
}
