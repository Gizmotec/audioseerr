import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getDiskSpace,
  type LidarrQualityProfile,
  type LidarrRootFolder,
  listArtists,
  listQualityProfiles,
  listRootFolders,
} from "@/lib/lidarr";
import { getSettings, isSetupComplete } from "@/lib/settings";
import { SettingsForm, type StorageInfo } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user) redirect("/login");
  if ((session.user as { role?: string }).role !== "ADMIN") {
    redirect("/home");
  }

  const settings = await getSettings();

  // Best-effort: pre-fetch profiles/root folders so the dropdowns are populated
  // immediately. If Lidarr is unreachable, the form falls back to keeping the
  // currently-saved IDs and lets the user re-probe.
  let profiles: LidarrQualityProfile[] = [];
  let rootFolders: LidarrRootFolder[] = [];
  let lidarrReachable = false;
  let storage: StorageInfo | null = null;
  if (settings.lidarrUrl && settings.lidarrApiKey) {
    const config = {
      url: settings.lidarrUrl,
      apiKey: settings.lidarrApiKey,
    };
    try {
      [profiles, rootFolders] = await Promise.all([
        listQualityProfiles(config),
        listRootFolders(config),
      ]);
      lidarrReachable = true;
    } catch {
      // Surface a soft warning in the form rather than failing the page.
    }

    if (lidarrReachable) {
      // Storage is best-effort: a slow/missing diskspace endpoint or a large
      // artist list shouldn't block the rest of the settings page.
      const [diskResult, artistsResult] = await Promise.allSettled([
        getDiskSpace(config),
        listArtists(config),
      ]);

      const rootPath = settings.lidarrRootFolderPath ?? "";
      let freeSpace: number | null = null;
      let totalSpace: number | null = null;
      let diskPath: string | null = null;
      if (diskResult.status === "fulfilled" && rootPath) {
        // Match the rootFolder against the longest disk path prefix — Lidarr
        // returns one entry per mount, and the rootFolder lives on whichever
        // mount is the deepest prefix of its path.
        const match = diskResult.value
          .filter((d) => rootPath === d.path || rootPath.startsWith(`${d.path.replace(/\/$/, "")}/`))
          .sort((a, b) => b.path.length - a.path.length)[0];
        if (match) {
          freeSpace = match.freeSpace;
          totalSpace = match.totalSpace;
          diskPath = match.path;
        }
      }

      let librarySize: number | null = null;
      let artistCount: number | null = null;
      let trackFileCount: number | null = null;
      if (artistsResult.status === "fulfilled") {
        const all = artistsResult.value;
        // Lidarr's artist objects sometimes report rootFolderPath with a
        // trailing slash; the saved setting may not. Compare normalized.
        const normalize = (p: string) => p.replace(/\/+$/, "");
        const normalizedRoot = normalize(rootPath);
        const matched = normalizedRoot
          ? all.filter(
              (a) =>
                !a.rootFolderPath ||
                normalize(a.rootFolderPath) === normalizedRoot,
            )
          : all;
        // If filtering by root path drops every artist but Lidarr does have
        // some, the rootFolderPath shape probably doesn't match what we
        // expect — fall back to the full list rather than reporting zero.
        const artists = matched.length === 0 && all.length > 0 ? all : matched;
        librarySize = artists.reduce(
          (sum, a) => sum + (a.statistics?.sizeOnDisk ?? 0),
          0,
        );
        artistCount = artists.length;
        trackFileCount = artists.reduce(
          (sum, a) => sum + (a.statistics?.trackFileCount ?? 0),
          0,
        );
      }

      if (
        freeSpace !== null ||
        totalSpace !== null ||
        librarySize !== null
      ) {
        storage = {
          rootFolderPath: rootPath || null,
          diskPath,
          freeSpace,
          totalSpace,
          librarySize,
          artistCount,
          trackFileCount,
        };
      }
    }
  }

  const env = {
    youtube: !!process.env.YOUTUBE_API_KEY,
    authSecret: !!process.env.AUTH_SECRET,
    audioseerrSecret: !!process.env.AUDIOSEERR_SECRET,
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Lidarr connection, library paths, and discovery API keys. Changes
          apply immediately — no restart needed.
        </p>
      </header>

      <SettingsForm
        initial={{
          lidarrUrl: settings.lidarrUrl ?? "",
          lidarrApiKeyMasked: settings.lidarrApiKey ? "••••••••" : "",
          lidarrDefaultProfileId: settings.lidarrDefaultProfileId ?? null,
          lidarrRootFolderPath: settings.lidarrRootFolderPath ?? "",
          prowlarrUrl: settings.prowlarrUrl ?? "",
          prowlarrApiKeyMasked: settings.prowlarrApiKey ? "••••••••" : "",
          qbittorrentUrl: settings.qbittorrentUrl ?? "",
          qbittorrentUsername: settings.qbittorrentUsername ?? "",
          qbittorrentPasswordMasked: settings.qbittorrentPassword
            ? "••••••••"
            : "",
          trackTorrentCategory:
            settings.trackTorrentCategory ?? "audioseerr-tracks",
          trackTorrentSavePath: settings.trackTorrentSavePath ?? "",
          trackTorrentMaxSizeMb: settings.trackTorrentMaxSizeMb,
          slskdUrl: settings.slskdUrl ?? "",
          slskdApiKeyMasked: settings.slskdApiKey ? "••••••••" : "",
          slskdDownloadPath: settings.slskdDownloadPath ?? "",
          lastFmApiKey: settings.lastFmApiKey ?? "",
          mediaPathMap: settings.mediaPathMap ?? "",
        }}
        profiles={profiles}
        rootFolders={rootFolders}
        lidarrReachable={lidarrReachable}
        storage={storage}
        env={env}
      />
    </main>
  );
}
