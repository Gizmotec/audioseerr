"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Navigation item in the sidebar. Highlights when the current route matches
 * the link's href — either exactly, or as a prefix (so `/playlists/abc` keeps
 * the Playlists item lit, and `/admin/requests` keeps Queue lit).
 *
 * `icon` is a rendered ReactNode rather than a component reference — passing
 * raw function/component references from a server component into a client
 * component crosses the RSC serialization boundary and throws at runtime.
 */
export function SidebarLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      {icon} {children}
    </Link>
  );
}
