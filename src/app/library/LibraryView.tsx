"use client";

import { Disc3, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { LibraryStatus } from "@/lib/library";
import { LibraryAlbumTile, type LibraryTileItem } from "./LibraryAlbumTile";

export type StatusFilter = "all" | LibraryStatus;

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "downloaded", label: "Downloaded" },
  { id: "downloading", label: "Downloading" },
  { id: "missing", label: "Missing" },
];

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
}

export function LibraryView({
  items,
  canDelete,
  initialStatus = "all",
}: {
  items: LibraryTileItem[];
  canDelete: boolean;
  initialStatus?: StatusFilter;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>(initialStatus);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: items.length,
      downloaded: 0,
      downloading: 0,
      missing: 0,
    };
    for (const i of items) c[i.status] += 1;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return items.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (!q) return true;
      return (
        normalize(i.title).includes(q) ||
        normalize(i.artistName).includes(q)
      );
    });
  }, [items, query, status]);

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artist or album"
            className="pl-8 pr-7"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatus(tab.id)}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors ${
                status === tab.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              }`}
            >
              {tab.label}
              <span
                className={`tabular-nums ${
                  status === tab.id ? "opacity-70" : "opacity-50"
                }`}
              >
                {counts[tab.id]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Disc3 className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
          <p>No matches.</p>
          {(query || status !== "all") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
              className="mt-2 text-foreground underline-offset-4 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((item) => (
            <li key={item.mbid}>
              <LibraryAlbumTile item={item} canDelete={canDelete} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
