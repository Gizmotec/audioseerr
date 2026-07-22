"use client";

import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createApiKeyAction, revokeApiKeyAction } from "@/lib/actions/apiKeys";

type ApiKeyRow = {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export function ApiKeysClient({ keys }: { keys: ApiKeyRow[] }) {
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The raw key, held only in client state until dismissed — the server only
  // stores its hash, so this callout is the one and only time it's visible.
  const [justCreated, setJustCreated] = useState<{ key: string; label: string } | null>(null);

  const create = () => {
    setError(null);
    startTransition(async () => {
      const r = await createApiKeyAction({ label });
      if (r.ok) {
        setJustCreated({ key: r.key, label: label.trim() });
        setLabel("");
      } else {
        setError(r.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Create a key
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) create();
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder='Label — e.g. "phone script"'
            aria-label="Key label"
            maxLength={100}
            className="max-w-sm"
          />
          <Button type="submit" disabled={pending || !label.trim()} className="gap-1.5">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create key
          </Button>
        </form>
        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </section>

      {justCreated && (
        <NewKeyCallout
          apiKey={justCreated.key}
          label={justCreated.label}
          onDismiss={() => setJustCreated(null)}
        />
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Your keys
        </h2>
        {keys.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            <KeyRound className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
            No API keys yet. Create one to call the API from scripts and other
            apps.
          </div>
        ) : (
          <ul className="divide-y divide-border/50 rounded-md border border-border/60">
            {keys.map((k) => (
              <KeyRow key={k.id} apiKey={k} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NewKeyCallout({
  apiKey,
  label,
  onDismiss,
}: {
  apiKey: string;
  label: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const copy = async () => {
    const ok = (await tryClipboardApi(apiKey)) || tryExecCommandCopy(apiKey);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      setCopyError("Could not copy — select the key manually.");
    }
  };

  return (
    <section
      className="rounded-2xl border-2 border-primary/40 bg-pastel-yellow/40 p-4"
      role="status"
    >
      <p className="text-sm font-bold text-ink">
        Key created{label ? ` for “${label}”` : ""} — copy it now.
      </p>
      <p className="mt-0.5 text-xs text-ink/70">
        This is the only time the full key is shown. It can&rsquo;t be
        recovered later.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={apiKey}
          aria-label="New API key"
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded bg-background/70 px-2.5 py-1.5 font-mono text-xs text-foreground outline-none focus:bg-background"
        />
        <Button size="sm" variant="secondary" onClick={copy} className="gap-1.5">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Done
        </Button>
      </div>
      {copyError && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {copyError}
        </p>
      )}
    </section>
  );
}

function KeyRow({ apiKey }: { apiKey: ApiKeyRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const revoke = () => {
    if (
      !confirm(
        `Revoke "${apiKey.label}"? Anything using this key will lose access immediately.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await revokeApiKeyAction(apiKey.id);
      if (!r.ok) setError(r.error);
    });
  };

  return (
    <li className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{apiKey.label}</span>
          <span className="rounded-sm bg-secondary/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {apiKey.prefix}…
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Created {formatDate(apiKey.createdAt)} ·{" "}
          {apiKey.lastUsedAt
            ? `last used ${formatDate(apiKey.lastUsedAt)}`
            : "never used"}
        </p>
        {error && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant="destructive"
        onClick={revoke}
        disabled={pending}
        className="gap-1.5 self-start md:self-center"
        aria-label={`Revoke ${apiKey.label}`}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        Revoke
      </Button>
    </li>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Clipboard helpers mirror src/app/admin/users/UsersAdminClient.tsx:
// navigator.clipboard needs a secure context, so plain-HTTP LAN installs fall
// back to the legacy execCommand path via a hidden textarea.
async function tryClipboardApi(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function tryExecCommandCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}
