"use client";

import { Clock, X } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import {
  clearRecentSearchesAction,
  deleteRecentSearchAction,
} from "@/lib/actions/recentSearches";
import type { RecentSearch } from "@/lib/recentSearches";

export function RecentSearches({ items }: { items: RecentSearch[] }) {
  const [pending, startTransition] = useTransition();

  if (items.length === 0) return null;

  const remove = (query: string) => {
    startTransition(async () => {
      await deleteRecentSearchAction(query);
    });
  };

  const clearAll = () => {
    startTransition(async () => {
      await clearRecentSearchesAction();
    });
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Recent
        </h2>
        <button
          type="button"
          onClick={clearAll}
          disabled={pending}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Clear all
        </button>
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-2xl border-2 border-ink bg-card">
        {items.map((item) => (
          <li
            key={item.query}
            className="flex items-center gap-2 px-3 py-2 text-sm"
          >
            <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Link
              href={`/search?q=${encodeURIComponent(item.query)}`}
              className="flex-1 truncate hover:underline"
            >
              {item.query}
            </Link>
            <button
              type="button"
              onClick={() => remove(item.query)}
              disabled={pending}
              aria-label={`Remove ${item.query} from recent searches`}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/60 hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
