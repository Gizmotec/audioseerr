"use client";

import { Music } from "lucide-react";

type Props = {
  href: string;
  label: string;
};

export function AppleMusicButton({ href, label }: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
    >
      <Music className="h-4 w-4" />
      {label}
    </a>
  );
}
