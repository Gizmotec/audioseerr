import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { getSettings } from "@/lib/settings";
import { currentAppVersion } from "@/lib/version";

// Uptime-monitor / Docker health probe. Intentionally UNAUTHENTICATED —
// monitors have no session, and src/proxy.ts only matches app pages (not
// /api/*), so this route is reachable without a login redirect.
//
//   GET /api/health
//     200 { status: "ok",       db: "ok",    lidarr, slskd, version }
//     200 { status: "degraded", db: "ok",    ... }  an integration is down
//     503 { status: "degraded", db: "error", ... }  database unreachable
//
// Integration values are only "connected" | "error" | "unconfigured" — never
// the underlying URL or API key — so the public response can't leak internals.
// Lidarr is the legacy (pre-slskd) integration: its Settings columns are
// vestigial, so current installs report "unconfigured"; the live downloader
// check is slskd.

export const runtime = "nodejs";
// Probes must run on every request — never prerender this route at build time.
export const dynamic = "force-dynamic";

type DbHealth = "ok" | "error";
type IntegrationHealth = "connected" | "error" | "unconfigured";

const PROBE_TIMEOUT_MS = 4000;

export async function GET() {
  const [db, lidarr, slskd] = await Promise.all([
    checkDb(),
    checkLidarr(),
    checkSlskd(),
  ]);

  const degraded = db === "error" || lidarr === "error" || slskd === "error";

  return Response.json(
    {
      status: degraded ? "degraded" : "ok",
      db,
      lidarr,
      slskd,
      version: currentAppVersion(),
    },
    // 200 even when degraded (DB up) so monitors can choose how to treat an
    // integration outage; 503 only when the app itself can't serve data.
    { status: db === "error" ? 503 : 200 },
  );
}

async function checkDb(): Promise<DbHealth> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "ok";
  } catch {
    return "error";
  }
}

async function checkLidarr(): Promise<IntegrationHealth> {
  try {
    // getSettings() no longer surfaces the vestigial lidarr* columns, so read
    // them directly — a null URL means the install never used Lidarr.
    const row = await prisma.settings.findUnique({
      where: { id: 1 },
      select: { lidarrUrl: true, lidarrApiKey: true },
    });
    const baseUrl = row?.lidarrUrl?.trim();
    if (!row || !baseUrl) return "unconfigured";
    const apiKey = row.lidarrApiKey ? maybeDecrypt(row.lidarrApiKey) : "";
    return await probe(`${trimTrailingSlash(baseUrl)}/api/v1/system/status`, {
      "X-Api-Key": apiKey,
    });
  } catch {
    return "error";
  }
}

async function checkSlskd(): Promise<IntegrationHealth> {
  try {
    const settings = await getSettings();
    const baseUrl = settings.slskdUrl?.trim();
    if (!baseUrl) return "unconfigured";
    // slskd's auth/connection check endpoint (see src/lib/slskd.ts).
    return await probe(`${trimTrailingSlash(baseUrl)}/api/v0/application`, {
      "X-API-Key": settings.slskdApiKey ?? "",
    });
  } catch {
    return "error";
  }
}

// GET the given status endpoint with a hard timeout. Returns only a coarse
// verdict and swallows errors, so URLs/keys can't leak into the response.
async function probe(
  url: string,
  headers: Record<string, string>,
): Promise<"connected" | "error"> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    return res.ok ? "connected" : "error";
  } catch {
    return "error";
  } finally {
    clearTimeout(timeout);
  }
}

// Older rows may hold a plaintext Lidarr key from before at-rest encryption;
// fall back to the raw value when it isn't decryptable.
function maybeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
