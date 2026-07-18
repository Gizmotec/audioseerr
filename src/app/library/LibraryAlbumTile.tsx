"use client";

import { Check, Disc3, Loader2, MoreVertical, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { InLibraryBadge } from "@/components/InLibraryBadge";
import { formatTrackLine } from "@/app/search/AlbumCard";
import { deleteLibraryAlbumAction } from "@/lib/actions/library";
import type { LibraryStatus } from "@/lib/library";

export type LibraryTileItem = {
  mbid: string;
  title: string;
  artistName: string;
  status: LibraryStatus;
  trackFileCount: number;
  totalTrackCount: number;
};

export function LibraryAlbumTile({
  item,
  canDelete = false,
}: {
  item: LibraryTileItem;
  canDelete?: boolean;
}) {
  const [imgOk, setImgOk] = useState(true);
  // The LibraryItem.mbid is Lidarr's foreignAlbumId i.e. the release-group MBID,
  // so coverartarchive resolves directly. Falls back to the Disc3 placeholder
  // for albums without front art.
  const coverUrl = `https://coverartarchive.org/release-group/${item.mbid}/front-250`;
  const trackLine = formatTrackLine({
    status: item.status,
    trackFileCount: item.trackFileCount,
    totalTrackCount: item.totalTrackCount,
  });

  return (
    <div className="group relative">
      <Link
        href={`/album/${item.mbid}`}
        className="flex flex-col gap-2 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-2">
          {imgOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              onError={() => setImgOk(false)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
              <Disc3 className="h-1/3 w-1/3" />
            </div>
          )}
          {item.status !== "downloaded" && (
            <InLibraryBadge status={item.status} />
          )}
        </div>
        <div className="space-y-0.5">
          <p
            className="truncate text-sm font-medium leading-snug"
            title={item.title}
          >
            {item.title}
          </p>
          <p
            className="truncate text-xs text-muted-foreground"
            title={item.artistName}
          >
            {item.artistName}
            {trackLine ? ` · ${trackLine}` : ""}
          </p>
        </div>
      </Link>
      {canDelete && (
        <DeleteAlbumMenu
          mbid={item.mbid}
          title={item.title}
          artistName={item.artistName}
        />
      )}
    </div>
  );
}

function DeleteAlbumMenu({
  mbid,
  title,
  artistName,
}: {
  mbid: string;
  title: string;
  artistName: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteLibraryAlbumAction(mbid);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
    });
  };

  return (
    <div ref={rootRef} className="absolute right-1.5 top-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Album actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-7 w-7 items-center justify-center rounded-full bg-card text-foreground opacity-0 transition-opacity hover:bg-pastel-yellow hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 ${
          open ? "opacity-100" : ""
        }`}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-foreground/10 bg-popover p-3 text-sm"
        >
          <p className="mb-1 text-foreground">Remove this album?</p>
          <p className="mb-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{title}</span>
            <span className="text-muted-foreground"> · {artistName}</span>
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            Lidarr will unmonitor the album and delete its files from disk. This
            cannot be undone.
          </p>
          {error && (
            <p className="mb-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-card px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-destructive px-3 text-xs font-bold text-ink transition-colors hover:bg-destructive/80 disabled:opacity-40"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
