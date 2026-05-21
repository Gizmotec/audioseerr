export type QBittorrentConfig = {
  url: string;
  username: string;
  password: string;
};

export type AddTorrentInput = {
  url?: string;
  file?: Blob;
  fileName?: string;
  category?: string | null;
  savePath?: string | null;
  tags?: string | null;
};

export type AddTorrentResult = {
  hash: string | null;
};

export type QBittorrentTorrent = {
  hash: string;
  name: string;
  progress: number;
  state: string;
  category?: string;
  tags?: string;
};

export type QBittorrentCategory = {
  name?: string;
  savePath?: string;
  save_path?: string;
};

export type QBittorrentConnectionStatus = {
  version: string;
  categories: Record<string, QBittorrentCategory>;
};

class QBittorrentError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function buildUrl(base: string, path: string): string {
  const trimmed = base.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${trimmed}${suffix}`;
}

async function login(config: QBittorrentConfig): Promise<string> {
  const body = new URLSearchParams({
    username: config.username,
    password: config.password,
  });
  const res = await fetch(buildUrl(config.url, "/api/v2/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok || !/^ok\.?$/i.test(text.trim())) {
    throw new QBittorrentError(res.status, "qBittorrent rejected the login.");
  }
  const cookie = res.headers.get("set-cookie");
  const sid = cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("SID="));
  if (!sid) {
    throw new QBittorrentError(res.status, "qBittorrent did not return a session cookie.");
  }
  return sid;
}

async function qbittorrentFetch(
  config: QBittorrentConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const sid = await login(config);
  return fetch(buildUrl(config.url, path), {
    ...init,
    headers: {
      Cookie: sid,
      ...init.headers,
    },
  });
}

export async function testQBittorrentConnection(
  config: QBittorrentConfig,
): Promise<QBittorrentConnectionStatus> {
  const [versionRes, categoriesRes] = await Promise.all([
    qbittorrentFetch(config, "/api/v2/app/version"),
    qbittorrentFetch(config, "/api/v2/torrents/categories", {
      headers: { Accept: "application/json" },
    }),
  ]);
  if (!versionRes.ok) {
    throw new QBittorrentError(
      versionRes.status,
      `qBittorrent version -> HTTP ${versionRes.status}`,
    );
  }
  if (!categoriesRes.ok) {
    throw new QBittorrentError(
      categoriesRes.status,
      `qBittorrent categories -> HTTP ${categoriesRes.status}`,
    );
  }

  return {
    version: (await versionRes.text()).trim(),
    categories: (await categoriesRes.json()) as Record<
      string,
      QBittorrentCategory
    >,
  };
}

async function ensureCategory(
  config: QBittorrentConfig,
  sid: string,
  category: string | null | undefined,
  savePath: string | null | undefined,
): Promise<void> {
  const trimmed = category?.trim();
  if (!trimmed) return;

  const categoriesRes = await fetch(
    buildUrl(config.url, "/api/v2/torrents/categories"),
    {
      headers: { Cookie: sid, Accept: "application/json" },
    },
  );
  if (!categoriesRes.ok) {
    throw new QBittorrentError(
      categoriesRes.status,
      `qBittorrent categories -> HTTP ${categoriesRes.status}`,
    );
  }
  const categories = (await categoriesRes.json()) as Record<
    string,
    QBittorrentCategory
  >;
  if (Object.prototype.hasOwnProperty.call(categories, trimmed)) return;

  const body = new URLSearchParams({ category: trimmed });
  if (savePath?.trim()) body.set("savePath", savePath.trim());
  const createRes = await fetch(
    buildUrl(config.url, "/api/v2/torrents/createCategory"),
    {
      method: "POST",
      headers: {
        Cookie: sid,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  if (!createRes.ok) {
    throw new QBittorrentError(
      createRes.status,
      `qBittorrent create category -> HTTP ${createRes.status}`,
    );
  }
}

export async function addTorrent(
  config: QBittorrentConfig,
  input: AddTorrentInput,
): Promise<AddTorrentResult> {
  const sid = await login(config);
  await ensureCategory(config, sid, input.category, input.savePath);

  // Snapshot every existing torrent hash so we can spot the new one without
  // relying on category/tag filters or fuzzy name matches (both of which the
  // earlier Codex implementation got wrong).
  const beforeHashes = await getAllTorrentHashes(config, sid);
  const expectedHash = input.url ? extractMagnetInfoHash(input.url) : null;

  const form = new FormData();
  if (input.url) {
    form.set("urls", input.url);
  }
  if (input.file) {
    // Force application/x-bittorrent on the multipart part — Prowlarr blobs
    // sometimes come through as application/octet-stream and at least one
    // qBittorrent build is picky about it.
    const bytes = await input.file.arrayBuffer();
    const blob = new Blob([bytes], { type: "application/x-bittorrent" });
    form.set("torrents", blob, input.fileName ?? "release.torrent");
  }
  if (input.category) form.set("category", input.category);
  if (input.savePath) form.set("savepath", input.savePath);
  if (input.tags) form.set("tags", input.tags);
  // `paused` covers qBittorrent 4.x; `stopped` is the 5.x rename. Sending both
  // is harmless on either version.
  form.set("paused", "false");
  form.set("stopped", "false");
  form.set("root_folder", "false");

  const res = await fetch(buildUrl(config.url, "/api/v2/torrents/add"), {
    method: "POST",
    headers: { Cookie: sid },
    body: form,
  });
  const text = await res.text();
  if (!res.ok || /fails/i.test(text)) {
    const suffix = text.trim() ? ` Response: ${text.trim()}` : "";
    throw new QBittorrentError(
      res.status,
      `qBittorrent could not add the torrent.${suffix}`,
    );
  }

  const torrent = await pollForNewTorrent(config, sid, beforeHashes, expectedHash);
  if (!torrent) {
    const detail = expectedHash
      ? ` Expected hash ${expectedHash} did not appear`
      : "";
    const hint = expectedHash
      ? " — the torrent might already be in qBittorrent (duplicates are silently ignored), or the magnet's info_hash was rejected."
      : " — the .torrent file may already exist, be invalid, or have been silently dropped. Check the qBittorrent log.";
    console.error(
      "[qbittorrent] add accepted but no new torrent appeared",
      JSON.stringify({
        response: text.trim(),
        expectedHash,
        beforeCount: beforeHashes.size,
        usedMagnet: !!input.url,
        usedFile: !!input.file,
        category: input.category ?? null,
        tags: input.tags ?? null,
      }),
    );
    throw new QBittorrentError(
      200,
      `qBittorrent accepted the add request but no new torrent appeared.${detail}${hint}`,
    );
  }
  return { hash: torrent.hash };
}

function extractMagnetInfoHash(url: string): string | null {
  if (!/^magnet:/i.test(url)) return null;
  const match = url.match(/[?&]xt=urn:btih:([a-zA-Z0-9]+)/i);
  if (!match) return null;
  const value = match[1].toLowerCase();
  // qBittorrent's info endpoint returns 40-char hex hashes. Accept hex
  // directly; skip base32 (32 chars) since converting it just to verify is
  // not worth the dependency.
  return /^[a-f0-9]{40}$/.test(value) ? value : null;
}

async function getAllTorrentHashes(
  config: QBittorrentConfig,
  sid: string,
): Promise<Set<string>> {
  const res = await fetch(buildUrl(config.url, "/api/v2/torrents/info"), {
    headers: { Cookie: sid, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new QBittorrentError(
      res.status,
      `qBittorrent info -> HTTP ${res.status}`,
    );
  }
  const torrents = (await res.json()) as { hash: string }[];
  return new Set(torrents.map((t) => t.hash.toLowerCase()));
}

async function pollForNewTorrent(
  config: QBittorrentConfig,
  sid: string,
  beforeHashes: Set<string>,
  expectedHash: string | null,
): Promise<QBittorrentTorrent | null> {
  // Up to ~12 seconds — long enough for qBittorrent to settle the metadata
  // entry without making a stuck add hang the approval round-trip forever.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const res = await fetch(buildUrl(config.url, "/api/v2/torrents/info"), {
      headers: { Cookie: sid, Accept: "application/json" },
    });
    if (res.ok) {
      const torrents = (await res.json()) as QBittorrentTorrent[];
      if (expectedHash) {
        const exact = torrents.find(
          (t) => t.hash.toLowerCase() === expectedHash,
        );
        if (exact) return exact;
      }
      const fresh = torrents.find(
        (t) => !beforeHashes.has(t.hash.toLowerCase()),
      );
      if (fresh) return fresh;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

export async function getTorrent(
  config: QBittorrentConfig,
  hash: string,
): Promise<QBittorrentTorrent | null> {
  const sid = await login(config);
  const params = new URLSearchParams({ hashes: hash });
  const res = await fetch(buildUrl(config.url, `/api/v2/torrents/info?${params}`), {
    headers: { Cookie: sid, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new QBittorrentError(res.status, `qBittorrent info -> HTTP ${res.status}`);
  }
  const torrents = (await res.json()) as QBittorrentTorrent[];
  return torrents[0] ?? null;
}

export { QBittorrentError };
