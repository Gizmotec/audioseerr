"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Back arrow that follows browser history. Falls through to `fallbackHref`
 * when there's no prior entry (deep-linked tab, fresh window).
 */
export function BackLink({
  fallbackHref,
  label = "Back",
}: {
  fallbackHref: string;
  label?: string;
}) {
  const router = useRouter();

  return (
    <Link
      href={fallbackHref}
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </Link>
  );
}
