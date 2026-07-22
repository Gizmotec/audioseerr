// Unit tests for the pure builders in src/lib/notifications.ts. The module
// imports prisma + settings at top level, so both are mocked to keep the
// suite hermetic (no native better-sqlite3 load, no env needed).
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/settings", () => ({ getSettings: vi.fn() }));

let buildWebhookPayload: typeof import("@/lib/notifications").buildWebhookPayload;
let buildNotificationCopy: typeof import("@/lib/notifications").buildNotificationCopy;

beforeAll(async () => {
  ({ buildWebhookPayload, buildNotificationCopy } = await import(
    "@/lib/notifications"
  ));
});

describe("buildWebhookPayload", () => {
  const request = {
    id: "req1",
    type: "ALBUM" as const,
    title: "OK Computer",
    artistName: "Radiohead",
    albumTitle: null,
    status: "APPROVED" as const,
  };

  it("maps all fields with injected deterministic timestamp", () => {
    const payload = buildWebhookPayload({
      type: "REQUEST_APPROVED",
      request,
      user: { id: "u1", username: "alex" },
      timestamp: new Date("2026-07-22T10:00:00Z"),
    });
    expect(payload).toEqual({
      event: "REQUEST_APPROVED",
      request: {
        id: "req1",
        type: "ALBUM",
        title: "OK Computer",
        artistName: "Radiohead",
        albumTitle: null,
        status: "APPROVED",
      },
      user: { id: "u1", username: "alex" },
      timestamp: "2026-07-22T10:00:00.000Z",
    });
  });

  it("defaults albumTitle undefined → null and tolerates missing request/user", () => {
    const payload = buildWebhookPayload({
      type: "REQUEST_FAILED",
      request: { ...request, albumTitle: undefined },
      timestamp: new Date("2026-07-22T10:00:00Z"),
    });
    expect(payload.request?.albumTitle).toBeNull();
    expect(payload.user).toBeNull();

    const bare = buildWebhookPayload({ type: "REQUEST_FAILED" });
    expect(bare.request).toBeNull();
    expect(bare.user).toBeNull();
    expect(typeof bare.timestamp).toBe("string");
  });
});

describe("buildNotificationCopy", () => {
  const album = { type: "ALBUM" as const, title: "OK Computer", artistName: "Radiohead" };
  const track = {
    type: "TRACK" as const,
    title: "Creep",
    artistName: "Radiohead",
    albumTitle: "Pablo Honey",
  };
  const artist = { type: "ARTIST" as const, title: "", artistName: "Radiohead" };

  it("describes albums as '<title> by <artist>'", () => {
    const copy = buildNotificationCopy("REQUEST_APPROVED", album);
    expect(copy).toEqual({
      title: "Your request was approved",
      body: "OK Computer by Radiohead",
    });
  });

  it("quotes track titles and appends the album context when present", () => {
    const copy = buildNotificationCopy("REQUEST_AVAILABLE", track);
    expect(copy.title).toBe("Your track is ready to play");
    expect(copy.body).toBe('"Creep" by Radiohead (Pablo Honey)');

    const noAlbum = buildNotificationCopy("REQUEST_AVAILABLE", {
      ...track,
      albumTitle: null,
    });
    expect(noAlbum.body).toBe('"Creep" by Radiohead');
  });

  it("uses bare artist name for artist requests", () => {
    expect(buildNotificationCopy("REQUEST_APPROVED", artist).body).toBe("Radiohead");
  });

  it("appends the decline/failure reason only when present", () => {
    expect(buildNotificationCopy("REQUEST_DECLINED", album, "already have it").body).toBe(
      "OK Computer by Radiohead — Reason: already have it",
    );
    expect(buildNotificationCopy("REQUEST_DECLINED", album).body).toBe(
      "OK Computer by Radiohead",
    );
    expect(buildNotificationCopy("REQUEST_FAILED", album, "not found on Soulseek").body).toBe(
      "OK Computer by Radiohead — not found on Soulseek",
    );
  });

  it("non-track AVAILABLE copy says 'request'", () => {
    expect(buildNotificationCopy("REQUEST_AVAILABLE", album).title).toBe(
      "Your request is ready to play",
    );
  });
});