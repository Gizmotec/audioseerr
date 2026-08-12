"use client";

// Transient, client-side messages — stacked in the bottom-right corner.
//
// These are for things that happen in response to a click and don't deserve a
// row in the notifications table: a track that couldn't be resolved, a fetch
// that failed, an unrequest that didn't take. They used to render as little
// bubbles anchored to whichever button raised them, which on a cover tile meant
// the text spilled off the card and was unreadable.
//
// Deliberately dependency-free: one provider, a list, and a timer.

import { AlertTriangle, Check, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export type ToastTone = "error" | "success" | "info";

type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
  /** What the message is about — a track or album title, shown above it. */
  subject?: string | null;
  expiresAt: number;
};

type ToastApi = {
  show: (tone: ToastTone, message: string, subject?: string | null) => void;
  error: (message: string, subject?: string | null) => void;
  success: (message: string, subject?: string | null) => void;
};

const NOOP: ToastApi = { show: () => {}, error: () => {}, success: () => {} };
const ToastContext = createContext<ToastApi>(NOOP);

/** Raise a toast. Safe to call from anywhere under the provider. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

/** Errors get longer on screen — they're the ones you actually have to read. */
const LIFETIME_MS: Record<ToastTone, number> = {
  error: 8000,
  success: 4000,
  info: 5000,
};
const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback(
    (tone: ToastTone, message: string, subject?: string | null) => {
      const expiresAt = Date.now() + LIFETIME_MS[tone];
      setToasts((prev) => {
        // Re-raising the same message (a retry that fails again) refreshes the
        // one on screen rather than stacking duplicates.
        const match = prev.find(
          (t) => t.message === message && t.subject === subject && t.tone === tone,
        );
        if (match) {
          return prev.map((t) => (t.id === match.id ? { ...t, expiresAt } : t));
        }
        const next = [
          ...prev,
          { id: nextId.current++, tone, message, subject, expiresAt },
        ];
        return next.slice(-MAX_VISIBLE);
      });
    },
    [],
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // One timer for the whole stack, re-armed for whichever expires next.
  useEffect(() => {
    if (toasts.length === 0) return;
    const soonest = Math.min(...toasts.map((t) => t.expiresAt));
    const timer = setTimeout(
      () => {
        const now = Date.now();
        setToasts((prev) => prev.filter((t) => t.expiresAt > now));
      },
      Math.max(50, soonest - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [toasts]);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      error: (message, subject) => show("error", message, subject),
      success: (message, subject) => show("success", message, subject),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        // Sits above the preview player when one is open.
        className="pointer-events-none fixed right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        style={{ bottom: "calc(1rem + var(--preview-player-bottom-offset, 0px))" }}
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONE_STYLE: Record<ToastTone, { accent: string; icon: React.ElementType }> = {
  error: { accent: "text-pastel-red", icon: AlertTriangle },
  success: { accent: "text-pastel-mint", icon: Check },
  info: { accent: "text-pastel-sky", icon: Info },
};

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { accent, icon: Icon } = TONE_STYLE[toast.tone];
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-foreground/10 bg-popover p-3 shadow-lg animate-in fade-in slide-in-from-bottom-2"
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", accent)} />
      <div className="min-w-0 flex-1">
        {toast.subject && (
          <p className="truncate text-sm font-bold" title={toast.subject}>
            {toast.subject}
          </p>
        )}
        <p className="text-sm text-muted-foreground">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
