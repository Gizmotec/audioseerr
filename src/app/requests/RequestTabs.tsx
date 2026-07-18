"use client";

import { useState } from "react";
import type { ReactNode } from "react";

type Tab = "requests" | "downloads";

export function RequestTabs({
  requests,
  downloads,
  requestsCount,
  downloadsCount,
  initial = "requests",
}: {
  requests: ReactNode;
  downloads: ReactNode;
  requestsCount: number;
  downloadsCount: number;
  initial?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initial);

  return (
    <div>
      <div role="tablist" className="mb-6 flex gap-2">
        <TabButton
          active={tab === "requests"}
          onClick={() => setTab("requests")}
          label="Requests"
          count={requestsCount}
        />
        <TabButton
          active={tab === "downloads"}
          onClick={() => setTab("downloads")}
          label="Downloads"
          count={downloadsCount}
        />
      </div>
      {/* Both panels stay mounted so download-progress polling survives a tab
          switch; `hidden` just toggles visibility. */}
      <div hidden={tab !== "requests"}>{requests}</div>
      <div hidden={tab !== "downloads"}>{downloads}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full border-2 px-3 py-1.5 text-sm font-bold transition-colors ${
        active
          ? "border-ink bg-pastel-yellow text-ink"
          : "border-transparent bg-surface-2 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {count > 0 && (
        <span className="ml-1.5 text-xs opacity-70">{count}</span>
      )}
    </button>
  );
}
