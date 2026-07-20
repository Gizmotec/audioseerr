"use client";

// Requests page, three tabs:
//   • Waiting approval — the pending queue (admin: approve/decline; user:
//     their unreviewed asks).
//   • Requested — approved requests working through the Soulseek scan queue.
//     Each row shows its mode: scanning (queued/being searched right now) or
//     waiting (scanned, not found yet — retrying on a cadence). Declined rows
//     trail at the end.
//   • Downloads — split into Downloading (in-flight, live progress) and
//     Download history (available + failed).
// Requested and Downloads tabs get a client-side search box.

import { Clock, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { AdminRequestRow, type RequestRowData } from "@/app/admin/requests/AdminRequestRow";
import { DownloadsProgressProvider } from "@/components/DownloadsProgressProvider";
import { Input } from "@/components/ui/input";
import { UserRequestRow } from "./UserRequestRow";

type Tab = "approval" | "requested" | "downloads";

export function RequestsClient({
  variant,
  pending,
  requested,
  downloading,
  history,
  requestedTotal,
  downloadsTotal,
}: {
  variant: "admin" | "user";
  pending: RequestRowData[];
  requested: RequestRowData[];
  downloading: RequestRowData[];
  history: RequestRowData[];
  /** Real (uncapped) totals for the tab badges — the row arrays may be capped. */
  requestedTotal: number;
  downloadsTotal: number;
}) {
  const [tab, setTab] = useState<Tab>(
    pending.length > 0 ? "approval" : "requested",
  );
  const [requestedQuery, setRequestedQuery] = useState("");
  const [downloadsQuery, setDownloadsQuery] = useState("");

  const filteredRequested = useMemo(
    () => filterRows(requested, requestedQuery),
    [requested, requestedQuery],
  );
  const filteredDownloading = useMemo(
    () => filterRows(downloading, downloadsQuery),
    [downloading, downloadsQuery],
  );
  const filteredHistory = useMemo(
    () => filterRows(history, downloadsQuery),
    [history, downloadsQuery],
  );

  const row = (r: RequestRowData, isPending = false) =>
    variant === "admin" ? (
      <AdminRequestRow key={r.id} request={r} isPending={isPending} />
    ) : (
      <UserRequestRow key={r.id} request={r} />
    );

  return (
    <div>
      <div role="tablist" className="mb-6 flex flex-wrap gap-2">
        <TabButton
          active={tab === "approval"}
          onClick={() => setTab("approval")}
          label="Waiting approval"
          count={pending.length}
        />
        <TabButton
          active={tab === "requested"}
          onClick={() => setTab("requested")}
          label="Requested"
          count={requestedTotal}
        />
        <TabButton
          active={tab === "downloads"}
          onClick={() => setTab("downloads")}
          label="Downloads"
          count={downloadsTotal}
        />
      </div>

      {/* Panels stay mounted so download-progress polling survives a tab
          switch; `hidden` just toggles visibility. */}
      <div hidden={tab !== "approval"}>
        {pending.length === 0 ? (
          <EmptyHint>
            {variant === "admin"
              ? "No pending requests."
              : "Nothing awaiting approval."}
          </EmptyHint>
        ) : (
          <ul className="divide-y divide-border/50">
            {pending.map((r) => row(r, true))}
          </ul>
        )}
      </div>

      <div hidden={tab !== "requested"}>
        <SearchBox
          value={requestedQuery}
          onChange={setRequestedQuery}
          placeholder="Search requested…"
        />
        {filteredRequested.length === 0 ? (
          <EmptyHint>
            {requestedQuery.trim() ? (
              "No matches."
            ) : variant === "user" ? (
              <>
                You haven&apos;t requested anything yet.{" "}
                <Link href="/search" className="underline">
                  Find an album
                </Link>{" "}
                to get started.
              </>
            ) : (
              "Nothing here yet."
            )}
          </EmptyHint>
        ) : (
          <ul className="divide-y divide-border/50">
            {filteredRequested.map((r) => row(r))}
          </ul>
        )}
        {requested.length < requestedTotal && (
          <TruncationNote shown={requested.length} total={requestedTotal} />
        )}
      </div>

      <div hidden={tab !== "downloads"}>
        <SearchBox
          value={downloadsQuery}
          onChange={setDownloadsQuery}
          placeholder="Search downloads…"
        />
        <DownloadsProgressProvider enabled={downloading.length > 0}>
          <section className="mb-10">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Downloading
              {downloading.length > 0 && (
                <Clock className="h-3.5 w-3.5 animate-pulse" />
              )}
            </h2>
            {filteredDownloading.length === 0 ? (
              <EmptyHint>
                {downloadsQuery.trim()
                  ? "No matches."
                  : "Nothing downloading right now."}
              </EmptyHint>
            ) : (
              <ul className="divide-y divide-border/50">
                {filteredDownloading.map((r) => row(r))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Download history
            </h2>
            {filteredHistory.length === 0 ? (
              <EmptyHint>
                {downloadsQuery.trim()
                  ? "No matches."
                  : variant === "admin"
                    ? "Nothing downloaded yet. Approved requests land here once a match is found on Soulseek."
                    : "Nothing downloaded yet. Your requests appear here once a match is found and the download finishes."}
              </EmptyHint>
            ) : (
              <ul className="divide-y divide-border/50">
                {filteredHistory.map((r) => row(r))}
              </ul>
            )}
            {history.length + downloading.length < downloadsTotal && (
              <TruncationNote
                shown={history.length + downloading.length}
                total={downloadsTotal}
              />
            )}
          </section>
        </DownloadsProgressProvider>
      </div>
    </div>
  );
}

function filterRows(rows: RequestRowData[], query: string): RequestRowData[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    `${r.title} ${r.artistName} ${r.albumTitle ?? ""} ${r.requestedBy ?? ""}`
      .toLowerCase()
      .includes(q),
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative mb-4">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-10"
        aria-label={placeholder}
      />
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
      {count > 0 && <span className="ml-1.5 text-xs opacity-70">{count}</span>}
    </button>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-ink/40 bg-card p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function TruncationNote({ shown, total }: { shown: number; total: number }) {
  return (
    <p className="mt-3 text-center text-xs text-muted-foreground">
      Showing the latest {shown} of {total}.
    </p>
  );
}
