"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  SMART_FIELD_OPS,
  SMART_PLAYLIST_MAX_LIMIT,
  SMART_PLAYLIST_MAX_RULES,
  SMART_PLAYLIST_MIN_LIMIT,
  validateRules,
  type SmartRule,
  type SmartRuleField,
  type SmartRuleOp,
} from "@/lib/smartPlaylist";
import { cn } from "@/lib/utils";

export type SmartPlaylistBuilderInitial = {
  name: string;
  rules: SmartRule[];
  limit: number;
};

type EditableRule = {
  field: SmartRuleField;
  op: SmartRuleOp;
  /** Raw input — coerced to number/boolean per field on submit. */
  value: string;
};

const FIELD_LABELS: Record<SmartRuleField, string> = {
  artist: "Artist",
  genre: "Genre",
  minPlays: "Play count",
  liked: "Liked",
};

const OP_LABELS: Record<SmartRuleOp, string> = {
  eq: "is",
  contains: "contains",
  gte: "at least",
  lte: "at most",
};

function defaultValueFor(field: SmartRuleField): string {
  switch (field) {
    case "minPlays":
      return "1";
    case "liked":
      return "true";
    default:
      return "";
  }
}

function toEditable(rule: SmartRule): EditableRule {
  return { field: rule.field, op: rule.op, value: String(rule.value) };
}

/** Coerce the editable rows to SmartRule[] via the shared strict validator. */
function buildRules(rows: EditableRule[]) {
  const coerced = rows.map((r) => ({
    field: r.field,
    op: r.op,
    value:
      r.field === "minPlays"
        ? Number(r.value)
        : r.field === "liked"
          ? r.value === "true"
          : r.value,
  }));
  return validateRules(coerced);
}

const selectClass =
  "h-9 rounded-xl border-2 border-transparent bg-surface-2 px-2 text-sm outline-none focus-visible:border-primary";
const inputClass =
  "h-9 rounded-xl bg-surface-2 px-2.5 text-sm outline-none focus:border-primary";

/**
 * Rule builder modal shared by "New smart playlist" (index page) and
 * "Edit rules" (detail page). Mirrors the LyricsButton modal shell: backdrop
 * click + ESC close, stopPropagation on the inner panel.
 */
export function SmartPlaylistBuilder({
  mode,
  initial,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  mode: "create" | "edit";
  initial: SmartPlaylistBuilderInitial;
  pending: boolean;
  error: string | null;
  onSubmit: (input: { name: string; rules: SmartRule[]; limit: number }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [rows, setRows] = useState<EditableRule[]>(
    initial.rules.length > 0
      ? initial.rules.map(toEditable)
      : [{ field: "artist", op: "eq", value: "" }],
  );
  const [limit, setLimit] = useState(String(initial.limit));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const updateRow = (i: number, patch: Partial<EditableRule>) => {
    setRows((prev) =>
      prev.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    );
  };

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setLocalError("Name is required.");
      return;
    }
    const parsedLimit = Number(limit);
    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < SMART_PLAYLIST_MIN_LIMIT ||
      parsedLimit > SMART_PLAYLIST_MAX_LIMIT
    ) {
      setLocalError(
        `Limit must be a whole number between ${SMART_PLAYLIST_MIN_LIMIT} and ${SMART_PLAYLIST_MAX_LIMIT}.`,
      );
      return;
    }
    const validated = buildRules(rows);
    if (!validated.ok) {
      setLocalError(validated.error);
      return;
    }
    setLocalError(null);
    onSubmit({ name: trimmed, rules: validated.rules, limit: parsedLimit });
  };

  const shownError = localError ?? error;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "New smart playlist" : "Edit smart playlist"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[80vh] w-full max-w-2xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium">
            {mode === "create" ? "New smart playlist" : "Edit smart playlist"}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto rounded-xl border border-foreground/10 bg-surface p-6">
          <div className="space-y-1.5">
            <label htmlFor="sp-name" className="text-xs font-medium text-muted-foreground">
              Name
            </label>
            <input
              id="sp-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Heavy rotation Radiohead"
              maxLength={100}
              disabled={pending}
              className={cn(inputClass, "w-full")}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Rules — tracks must match all of them
            </p>
            {rows.length === 0 && (
              <p className="rounded-xl border-2 border-dashed border-foreground/15 px-3 py-2 text-xs text-muted-foreground">
                No rules — this playlist matches your whole library.
              </p>
            )}
            {rows.map((row, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Rule ${i + 1} field`}
                  value={row.field}
                  disabled={pending}
                  onChange={(e) => {
                    const field = e.target.value as SmartRuleField;
                    updateRow(i, {
                      field,
                      op: SMART_FIELD_OPS[field][0],
                      value: defaultValueFor(field),
                    });
                  }}
                  className={selectClass}
                >
                  {(
                    Object.keys(FIELD_LABELS) as SmartRuleField[]
                  ).map((f) => (
                    <option key={f} value={f}>
                      {FIELD_LABELS[f]}
                    </option>
                  ))}
                </select>

                {SMART_FIELD_OPS[row.field].length > 1 ? (
                  <select
                    aria-label={`Rule ${i + 1} operator`}
                    value={row.op}
                    disabled={pending}
                    onChange={(e) =>
                      updateRow(i, { op: e.target.value as SmartRuleOp })
                    }
                    className={selectClass}
                  >
                    {SMART_FIELD_OPS[row.field].map((op) => (
                      <option key={op} value={op}>
                        {OP_LABELS[op]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="px-1 text-sm text-muted-foreground">
                    {OP_LABELS[SMART_FIELD_OPS[row.field][0]]}
                  </span>
                )}

                {row.field === "liked" ? (
                  <select
                    aria-label={`Rule ${i + 1} value`}
                    value={row.value}
                    disabled={pending}
                    onChange={(e) => updateRow(i, { value: e.target.value })}
                    className={selectClass}
                  >
                    <option value="true">yes</option>
                    <option value="false">no</option>
                  </select>
                ) : row.field === "minPlays" ? (
                  <input
                    aria-label={`Rule ${i + 1} value`}
                    type="number"
                    min={0}
                    step={1}
                    value={row.value}
                    disabled={pending}
                    onChange={(e) => updateRow(i, { value: e.target.value })}
                    className={cn(inputClass, "w-24")}
                  />
                ) : (
                  <input
                    aria-label={`Rule ${i + 1} value`}
                    type="text"
                    value={row.value}
                    placeholder={row.field === "artist" ? "Artist name" : "e.g. rock"}
                    disabled={pending}
                    onChange={(e) => updateRow(i, { value: e.target.value })}
                    className={cn(inputClass, "w-44 flex-1")}
                  />
                )}

                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                  disabled={pending}
                  aria-label={`Remove rule ${i + 1}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setRows((prev) => [
                  ...prev,
                  { field: "artist", op: "eq", value: "" },
                ])
              }
              disabled={pending || rows.length >= SMART_PLAYLIST_MAX_RULES}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Add rule
            </button>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="sp-limit" className="text-xs font-medium text-muted-foreground">
              Max tracks
            </label>
            <input
              id="sp-limit"
              type="number"
              min={SMART_PLAYLIST_MIN_LIMIT}
              max={SMART_PLAYLIST_MAX_LIMIT}
              step={1}
              value={limit}
              disabled={pending}
              onChange={(e) => setLimit(e.target.value)}
              className={cn(inputClass, "w-28")}
            />
          </div>

          {shownError && <p className="text-xs text-destructive">{shownError}</p>}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="inline-flex h-9 items-center rounded-full bg-card px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-pastel-pink/80 disabled:opacity-40"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "create" ? (
                "Create"
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
