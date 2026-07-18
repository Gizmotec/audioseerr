import {
  Compass,
  Heart,
  Home,
  Inbox,
  Library,
  ListMusic,
  Settings as SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { SidebarLink } from "@/components/SidebarLink";
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
        <SidebarLink href="/discover" icon={<Compass className="h-4 w-4" />}>
          Discover
        </SidebarLink>
        <SidebarLink href="/home" icon={<Home className="h-4 w-4" />}>
          Home
        </SidebarLink>
        <SidebarLink href="/liked" icon={<Heart className="h-4 w-4" />}>
          Liked
        </SidebarLink>
        <SidebarLink href="/playlists" icon={<ListMusic className="h-4 w-4" />}>
          Playlists
        </SidebarLink>
        <SidebarLink href="/library" icon={<Library className="h-4 w-4" />}>
          Library
        </SidebarLink>
        <SidebarLink href="/requests" icon={<Inbox className="h-4 w-4" />}>
          Requests
        </SidebarLink>
        {role === "ADMIN" && (
          <SidebarLink
            href="/admin/settings"
            icon={<SettingsIcon className="h-4 w-4" />}
          >
            Settings
          </SidebarLink>
        )}
      </nav>

      <div className="border-t border-border px-4 py-4">
        <p className="truncate text-xs text-muted-foreground">
          Signed in as{" "}
          <span className="font-mono text-foreground">{session.user.name}</span>
          {role === "ADMIN" ? " · admin" : ""}
        </p>
        <Link
          href="/account"
          className="mt-2 block rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
        >
          Account
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
            className="w-full justify-start px-2"
          >
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}

