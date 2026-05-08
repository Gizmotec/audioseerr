"use client";

import { Check, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  createInviteAction,
  deleteUserAction,
  revokeInviteAction,
  setUserAutoApproveAction,
} from "./actions";

type UserRow = {
  id: string;
  username: string;
  email: string;
  role: string;
  autoApprove: boolean;
  createdAt: string;
};

type InviteRow = {
  token: string;
  createdByUsername: string;
  expiresAt: string;
};

export function UsersAdminClient({
  currentUserId,
  adminCount,
  users,
  invites,
}: {
  currentUserId: string;
  adminCount: number;
  users: UserRow[];
  invites: InviteRow[];
}) {
  return (
    <div className="space-y-10">
      <InvitesSection invites={invites} />
      <UsersSection
        users={users}
        currentUserId={currentUserId}
        adminCount={adminCount}
      />
    </div>
  );
}

function InvitesSection({ invites }: { invites: InviteRow[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justCreatedToken, setJustCreatedToken] = useState<string | null>(null);

  const create = () => {
    setError(null);
    startTransition(async () => {
      const r = await createInviteAction();
      if (r.ok) {
        setJustCreatedToken(r.token);
      } else {
        setError(r.error);
      }
    });
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Invites
        </h2>
        <Button size="sm" onClick={create} disabled={pending} className="gap-1.5">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create invite
        </Button>
      </div>

      {error && (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {invites.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No active invites. Create one to give someone access.
        </div>
      ) : (
        <ul className="divide-y divide-border/50 rounded-md border border-border/60">
          {invites.map((invite) => (
            <InviteRow
              key={invite.token}
              invite={invite}
              defaultExpanded={invite.token === justCreatedToken}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function InviteRow({
  invite,
  defaultExpanded,
}: {
  invite: InviteRow;
  defaultExpanded: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = origin ? `${origin}/invite/${invite.token}` : `/invite/${invite.token}`;

  const copy = async () => {
    // navigator.clipboard requires a secure context (HTTPS or localhost). On
    // a plain-HTTP LAN/Tailscale IP it's undefined, so we fall back to the
    // legacy execCommand path via a hidden textarea.
    const ok = (await tryClipboardApi(url)) || tryExecCommandCopy(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      setError("Could not copy — select the link manually.");
    }
  };

  const revoke = () => {
    if (!confirm("Revoke this invite? The link will stop working.")) return;
    setError(null);
    startTransition(async () => {
      const r = await revokeInviteAction(invite.token);
      if (!r.ok) setError(r.error);
    });
  };

  return (
    <li className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-3">
      <div className="min-w-0 flex-1">
        <input
          type="text"
          readOnly
          value={url}
          aria-label="Invite link"
          autoFocus={defaultExpanded}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-md border border-border/60 bg-background px-2.5 py-1.5 font-mono text-xs text-foreground"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Created by <span className="font-mono">{invite.createdByUsername}</span> ·
          expires {formatRelative(invite.expiresAt)}
        </p>
        {error && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="secondary" onClick={copy} className="gap-1.5">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={revoke}
          disabled={pending}
          className="gap-1.5"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Revoke
        </Button>
      </div>
    </li>
  );
}

function UsersSection({
  users,
  currentUserId,
  adminCount,
}: {
  users: UserRow[];
  currentUserId: string;
  adminCount: number;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
        People
      </h2>
      <ul className="divide-y divide-border/50 rounded-md border border-border/60">
        {users.map((user) => (
          <UserRowItem
            key={user.id}
            user={user}
            isSelf={user.id === currentUserId}
            isLastAdmin={user.role === "ADMIN" && adminCount <= 1}
          />
        ))}
      </ul>
    </section>
  );
}

function UserRowItem({
  user,
  isSelf,
  isLastAdmin,
}: {
  user: UserRow;
  isSelf: boolean;
  isLastAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Local optimistic state — server revalidates the page on success, so this
  // value will be replaced on the next render. Keeping it in state lets the
  // toggle feel instant without waiting for a round-trip.
  const [autoApprove, setAutoApprove] = useState(user.autoApprove);

  const toggleAutoApprove = () => {
    const next = !autoApprove;
    setAutoApprove(next);
    setError(null);
    startTransition(async () => {
      const r = await setUserAutoApproveAction(user.id, next);
      if (!r.ok) {
        setAutoApprove(!next);
        setError(r.error);
      }
    });
  };

  const remove = () => {
    if (!confirm(`Remove ${user.username}? Their playlists, likes, and history will be deleted.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await deleteUserAction(user.id);
      if (!r.ok) setError(r.error);
    });
  };

  const canDelete = !isSelf && !isLastAdmin;
  const deleteHint = isSelf
    ? "Can't delete yourself"
    : isLastAdmin
      ? "Can't delete the last admin"
      : null;

  return (
    <li className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{user.username}</span>
          {user.role === "ADMIN" && (
            <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
              Admin
            </span>
          )}
          {isSelf && (
            <span className="text-xs text-muted-foreground">(you)</span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        {error && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant={autoApprove ? "default" : "outline"}
          onClick={toggleAutoApprove}
          disabled={pending}
          aria-pressed={autoApprove}
          title="When on, this user's requests skip the approval queue."
        >
          Auto-approve {autoApprove ? "on" : "off"}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={remove}
          disabled={pending || !canDelete}
          title={deleteHint ?? "Remove user"}
          aria-label={`Remove ${user.username}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

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
  // Off-screen but selectable — some browsers refuse copy on display:none.
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

function formatRelative(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const min = Math.floor(diff / 60000);
  if (min < 0) return "expired";
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `in ${hr}h`;
  const day = Math.floor(hr / 24);
  return `in ${day}d`;
}
