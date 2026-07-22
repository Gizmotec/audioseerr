import { describe, expect, it } from "vitest";
import {
  mergeRecentReleases,
  parseMbDate,
  sinceDateString,
  type FeedRelease,
} from "@/lib/releaseFeed";

const NOW = new Date("2026-07-22T12:00:00Z");

function rg(
  mbid: string,
  firstReleaseDate: string | null,
  title = `Album ${mbid}`,
  artistName = "Some Artist",
): FeedRelease {
  return { mbid, title, artistName, firstReleaseDate };
}

describe("parseMbDate", () => {
  it("passes full ISO dates through", () => {
    expect(parseMbDate("2026-07-18")).toBe("2026-07-18");
  });

  it("pads partial dates with the earliest possible day", () => {
    expect(parseMbDate("2026")).toBe("2026-01-01");
    expect(parseMbDate("2026-06")).toBe("2026-06-01");
  });

  it("rejects junk and null", () => {
    expect(parseMbDate(null)).toBeNull();
    expect(parseMbDate("")).toBeNull();
    expect(parseMbDate("July 2026")).toBeNull();
    expect(parseMbDate("2026-7-2")).toBeNull();
  });
});

describe("sinceDateString", () => {
  it("subtracts the window in whole days", () => {
    expect(sinceDateString(NOW, 90)).toBe("2026-04-23");
    expect(sinceDateString(NOW, 7)).toBe("2026-07-15");
  });
});

describe("mergeRecentReleases", () => {
  it("keeps releases inside the 90-day window, drops older ones", () => {
    const out = mergeRecentReleases(
      [
        [
          rg("a", "2026-07-01"), // in window
          rg("b", "2026-01-15"), // too old
        ],
      ],
      { now: NOW },
    );
    expect(out.map((r) => r.mbid)).toEqual(["a"]);
  });

  it("keeps a release dated exactly on the window boundary", () => {
    const out = mergeRecentReleases([[rg("edge", "2026-04-23")]], { now: NOW });
    expect(out).toHaveLength(1);
  });

  it("drops releases with missing or unparseable dates", () => {
    const out = mergeRecentReleases(
      [[rg("x", null), rg("y", "unknown"), rg("z", "2026-07-04")]],
      { now: NOW },
    );
    expect(out.map((r) => r.mbid)).toEqual(["z"]);
  });

  it("sorts newest-first with a deterministic title tie-break", () => {
    const out = mergeRecentReleases(
      [
        [
          rg("a", "2026-06-10", "Beta"),
          rg("b", "2026-07-20", "Gamma"),
          rg("c", "2026-06-10", "Alpha"),
        ],
      ],
      { now: NOW },
    );
    expect(out.map((r) => r.title)).toEqual(["Gamma", "Alpha", "Beta"]);
  });

  it("dedupes the same release group surfacing under several artists", () => {
    const dupe = rg("shared", "2026-07-11", "Collab Album", "A & B");
    const out = mergeRecentReleases(
      [
        [dupe, rg("a1", "2026-07-01")],
        [dupe, rg("b1", "2026-07-02")],
      ],
      { now: NOW },
    );
    expect(out.map((r) => r.mbid)).toEqual(["shared", "b1", "a1"]);
  });

  it("treats partial dates by their first day (window edge)", () => {
    // "2026-04" pads to 2026-04-01 — before the 2026-04-23 boundary → dropped.
    // "2026-05" pads to 2026-05-01 → inside.
    const out = mergeRecentReleases(
      [[rg("april", "2026-04"), rg("may", "2026-05")]],
      { now: NOW },
    );
    expect(out.map((r) => r.mbid)).toEqual(["may"]);
  });

  it("caps the merged feed at the limit", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      rg(`r${i}`, "2026-07-10", `Album ${String(i).padStart(2, "0")}`),
    );
    const out = mergeRecentReleases([many], { now: NOW, limit: 50 });
    expect(out).toHaveLength(50);
  });

  it("preserves extra fields on richer row types", () => {
    type Rich = FeedRelease & { coverUrl: string };
    const rich: Rich = { ...rg("a", "2026-07-01"), coverUrl: "https://x/y" };
    const out = mergeRecentReleases<Rich>([[rich]], { now: NOW });
    expect(out[0]!.coverUrl).toBe("https://x/y");
  });
});
