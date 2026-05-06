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

export async function addTorrent(
  config: QBittorrentConfig,
  input: AddTorrentInput,
): Promise<AddTorrentResult> {
  const sid = await login(config);
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
    throw new QBittorrentError(res.status, "qBittorrent could not add the torrent.");
  }

  try {
    const parsed = JSON.parse(text) as { added_torrent_ids?: string[] };
    return { hash: parsed.added_torrent_ids?.[0] ?? null };
  } catch {
    return { hash: null };
  }
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
