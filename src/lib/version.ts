import packageJson from "../../package.json";

const DEFAULT_UPDATE_REPO = "Gizmotec/audioseerr";
const UPDATE_CHECK_TTL_SECONDS = 6 * 60 * 60;

type LatestVersion = {
  version: string;
  url: string | null;
};

export type VersionCheck = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  checkedAt: string;
};

type GitHubRelease = {
  tag_name?: string;
  html_url?: string;
};

type GitHubTag = {
  name?: string;
};

export async function getVersionCheck(): Promise<VersionCheck> {
  const currentVersion = currentAppVersion();
  const checkedAt = new Date().toISOString();
  const repo = updateRepo();

  if (!repo) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      checkedAt,
    };
  }

  try {
    const latest = await fetchLatestVersion(repo);
    return {
      currentVersion,
      latestVersion: latest?.version ?? null,
      updateAvailable: latest
        ? isVersionNewer(latest.version, currentVersion)
        : false,
      releaseUrl: latest?.url ?? null,
      checkedAt,
    };
  } catch (err) {
    console.error("[version] update check failed:", err);
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      checkedAt,
    };
  }
}

export function isVersionNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

function currentAppVersion(): string {
  return process.env.AUDIOSEERR_VERSION?.trim() || packageJson.version;
}

function updateRepo(): string | null {
  const repo = (
    process.env.AUDIOSEERR_UPDATE_REPO?.trim() || DEFAULT_UPDATE_REPO
  ).replace(/^https:\/\/github\.com\//, "");

  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ? repo : null;
}

async function fetchLatestVersion(repo: string): Promise<LatestVersion | null> {
  const release = await fetchLatestRelease(repo);
  if (release) return release;
  return fetchLatestTag(repo);
}

async function fetchLatestRelease(repo: string): Promise<LatestVersion | null> {
  const res = await githubFetch(
    `https://api.github.com/repos/${repo}/releases/latest`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub releases returned ${res.status}`);

  const release = (await res.json()) as GitHubRelease;
  const version = release.tag_name?.trim();
  if (!version) return null;

  return {
    version,
    url: release.html_url ?? `https://github.com/${repo}/releases/tag/${version}`,
  };
}

async function fetchLatestTag(repo: string): Promise<LatestVersion | null> {
  const res = await githubFetch(`https://api.github.com/repos/${repo}/tags`);
  if (!res.ok) throw new Error(`GitHub tags returned ${res.status}`);

  const tags = (await res.json()) as GitHubTag[];
  const version = tags
    .map((tag) => tag.name?.trim() ?? "")
    .filter((tag) => parseVersion(tag))
    .sort(compareVersions)
    .at(-1);
  if (!version) return null;

  return {
    version,
    url: `https://github.com/${repo}/tree/${encodeURIComponent(version)}`,
  };
}

function githubFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": `Audioseerr/${currentAppVersion()}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    next: { revalidate: UPDATE_CHECK_TTL_SECONDS },
  });
}

function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;

  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }

  return comparePrerelease(left.prerelease, right.prerelease);
}

function parseVersion(version: string):
  | {
      major: number;
      minor: number;
      patch: number;
      prerelease: string[];
    }
  | null {
  const match = version
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;

    const leftNumber = Number(left);
    const rightNumber = Number(right);
    const leftIsNumber = Number.isInteger(leftNumber);
    const rightIsNumber = Number.isInteger(rightNumber);

    if (leftIsNumber && rightIsNumber) {
      return leftNumber > rightNumber ? 1 : -1;
    }
    if (leftIsNumber) return -1;
    if (rightIsNumber) return 1;
    return left > right ? 1 : -1;
  }

  return 0;
}
