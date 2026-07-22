"use client";

import { Check, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  type AutoApproveType,
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
  autoApproveArtist: boolean;
  autoApproveAlbum: boolean;
  autoApproveTrack: boolean;
  createdAt: string;
};

const AUTO_APPROVE_TYPES: { type: AutoApproveType; label: string; field: "autoApproveArtist" | "autoApproveAlbum" | "autoApproveTrack" }[] = [
  { type: "ARTIST", label: "Artists", field: "autoApproveArtist" },
  { type: "ALBUM", label: "Albums", field: "autoApproveAlbum" },
  { type: "TRACK", label: "Tracks", field: "autoApproveTrack" },
];

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
  // window.location is client-only; useSyncExternalStore reads it after
  // hydration (server snapshot "") — the setState-in-effect pattern is
  // rejected by the React Compiler lint rules.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

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
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={url}
          aria-label="Invite link"
          autoFocus={defaultExpanded}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded bg-secondary/40 px-2.5 py-1.5 font-mono text-xs text-foreground outline-none focus:bg-secondary/60"
        />
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
      <p className="text-xs text-muted-foreground">
        Created by <span className="font-mono">{invite.createdByUsername}</span> ·
        expires {formatRelative(invite.expiresAt)}
      </p>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
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

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground" title="Toggle auto-approve per request type">
          Auto-approve:
        </span>
        {AUTO_APPROVE_TYPES.map(({ type, label, field }) => (
          <AutoApproveChip
            key={type}
            userId={user.id}
            type={type}
            label={label}
            initialOn={user[field]}
            onError={setError}
          />
        ))}
        <Button
          size="sm"
          variant="destructive"
          onClick={remove}
          disabled={pending || !canDelete}
          title={deleteHint ?? "Remove user"}
          aria-label={`Remove ${user.username}`}
          className="ml-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

function AutoApproveChip({
  userId,
  type,
  label,
  initialOn,
  onError,
}: {
  userId: string;
  type: AutoApproveType;
  label: string;
  initialOn: boolean;
  onError: (msg: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  // Optimistic: flip immediately, revert if the server rejects.
  const [on, setOn] = useState(initialOn);

  const toggle = () => {
    const next = !on;
    setOn(next);
    onError(null);
    startTransition(async () => {
      const r = await setUserAutoApproveAction(userId, type, next);
      if (!r.ok) {
        setOn(!next);
        onError(r.error);
      }
    });
  };

  return (
    <Button
      size="sm"
      variant={on ? "default" : "outline"}
      onClick={toggle}
      disabled={pending}
      aria-pressed={on}
      title={`${label}: ${on ? "auto-approve" : "manual approval required"}`}
      className={on ? undefined : "text-muted-foreground"}
    >
      {label}
    </Button>
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
