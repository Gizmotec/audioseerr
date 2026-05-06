"use client";

import { ExternalLink, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";

type VersionCheck = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
};

const DISMISS_PREFIX = "audioseerr.updateBanner.dismissed.";

export function VersionUpdateBanner() {
  const [version, setVersion] = useState<VersionCheck | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkVersion() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;

        const next = (await res.json()) as VersionCheck;
        if (!next.updateAvailable || !next.latestVersion) return;

        const dismissed = getDismissed(next.latestVersion);
        if (!cancelled && dismissed !== "true") {
          setVersion(next);
        }
      } catch {
        // Version checks should never interrupt normal app use.
      }
    }

    void checkVersion();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!version?.latestVersion) return null;

  const latestVersion = version.latestVersion;

  const dismiss = () => {
    setDismissed(latestVersion);
    setVersion(null);
  };

  return (
    <div
      role="status"
      className="border-b border-border bg-secondary/80 px-4 py-2 text-sm shadow-sm backdrop-blur supports-[backdrop-filter]:bg-secondary/65"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-secondary-foreground">
          <RefreshCw className="h-4 w-4 shrink-0" />
          <p className="min-w-0">
            <span className="font-medium">Audioseerr {version.latestVersion}</span>{" "}
            is available. You&apos;re running {version.currentVersion}.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {version.releaseUrl && (
            <a
              href={version.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-secondary-foreground hover:bg-background/70"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View release
            </a>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss update notice"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background/70 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function getDismissed(version: string): string | null {
  try {
    return window.localStorage.getItem(`${DISMISS_PREFIX}${version}`);
  } catch {
    return null;
  }
}

function setDismissed(version: string) {
  try {
    window.localStorage.setItem(`${DISMISS_PREFIX}${version}`, "true");
  } catch {
    // Dismiss for the current session even when persistence is unavailable.
  }
}
