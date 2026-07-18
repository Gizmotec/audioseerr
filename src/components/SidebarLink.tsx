"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const accents = {
  pink: "bg-pastel-pink text-ink",
  yellow: "bg-pastel-yellow text-ink",
  mint: "bg-pastel-mint text-ink",
  sky: "bg-pastel-sky text-ink",
  lavender: "bg-pastel-lavender text-ink",
  red: "bg-pastel-red text-ink",
} as const;

export type SidebarAccent = keyof typeof accents;

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
  accent = "pink",
  children,
}: {
  href: string;
  icon: React.ReactNode;
  accent?: SidebarAccent;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-full border-2 px-3 py-2 text-sm font-semibold transition-colors",
        active
          ? cn("border-ink", accents[accent])
          : "border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-full border-2",
          active ? "border-ink/20 bg-ink/10" : cn("border-ink", accents[accent]),
        )}
      >
        {icon}
      </span>
      {children}
    </Link>
  );
}
