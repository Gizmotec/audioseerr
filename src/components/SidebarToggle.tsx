"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const STORAGE_KEY = "audioseerr.sidebar.collapsed";

/**
 * Collapse toggle for the sidebar. State lives on <html> as the
 * `sidebar-collapsed` class (see globals.css) and persists in localStorage;
 * layout.tsx applies it pre-paint with an inline script, so there's no flash
 * and no React hydration mismatch.
 */
export function SidebarToggle() {
  const toggle = () => {
    const collapsed = document.documentElement.classList.toggle(
      "sidebar-collapsed",
    );
    try {
      window.localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // Persistence is best-effort (private browsing etc).
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle sidebar"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <PanelLeftClose className="sidebar-icon-collapse h-4 w-4" />
      <PanelLeftOpen className="sidebar-icon-expand h-4 w-4" />
    </button>
  );
}
