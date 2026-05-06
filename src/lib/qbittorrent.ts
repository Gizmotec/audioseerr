export type QBittorrentConfig = {
  url: string;
  username: string;
  password: string;
};

export type AddTorrentInput = {
  url?: string;
  file?: Blob;
  fileName?: string;
  expectedName?: string;
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
  const form = new FormData();
  if (input.url) {
    form.set("urls", input.url);
  }
  if (input.file) {
    form.set("torrents", input.file, input.fileName ?? "release.torrent");
  }
  if (input.category) form.set("category", input.category);
  if (input.savePath) form.set("savepath", input.savePath);
  if (input.tags) form.set("tags", input.tags);
  form.set("paused", "false");
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

  try {
    const parsed = JSON.parse(text) as { added_torrent_ids?: string[] };
    const hash = parsed.added_torrent_ids?.[0] ?? null;
    if (hash) return { hash };
  } catch {
    // qBittorrent 4.x returns plain text "Ok." instead of JSON.
  }

  const torrent = await waitForAddedTorrent(config, {
    category: input.category,
    tags: input.tags,
    expectedName: input.expectedName ?? input.fileName,
  });
  if (!torrent) {
    throw new QBittorrentError(
      200,
      "qBittorrent accepted the add request but no torrent appeared in the transfer list.",
    );
  }
  return { hash: torrent.hash };
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

async function listTorrents(
  config: QBittorrentConfig,
  filter: { category?: string | null; tag?: string | null } = {},
): Promise<QBittorrentTorrent[]> {
  const sid = await login(config);
  const params = new URLSearchParams();
  if (filter.category?.trim()) params.set("category", filter.category.trim());
  if (filter.tag?.trim()) params.set("tag", filter.tag.trim());
  const suffix = params.size > 0 ? `?${params}` : "";
  const res = await fetch(buildUrl(config.url, `/api/v2/torrents/info${suffix}`), {
    headers: { Cookie: sid, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new QBittorrentError(res.status, `qBittorrent info -> HTTP ${res.status}`);
  }
  return (await res.json()) as QBittorrentTorrent[];
}

async function waitForAddedTorrent(
  config: QBittorrentConfig,
  input: {
    category?: string | null;
    tags?: string | null;
    expectedName?: string | null;
  },
): Promise<QBittorrentTorrent | null> {
  const tag = input.tags?.split(",").map((t) => t.trim()).find(Boolean) ?? null;
  const expected = normalizeName(input.expectedName ?? "");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const torrents = await listTorrents(config, {
      category: input.category,
      tag,
    });
    const matched =
      torrents.find((torrent) => {
        if (!expected) return false;
        const name = normalizeName(torrent.name);
        return name.includes(expected) || expected.includes(name);
      }) ?? torrents.at(-1);
    if (matched) return matched;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  return null;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.(torrent|mp3|flac|m4a|aac|ogg|opus|wav)$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export { QBittorrentError };
