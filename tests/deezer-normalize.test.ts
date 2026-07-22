import { describe, expect, it, vi } from "vitest";
import { normalizeTrackTitle, trackMatchKey } from "@/lib/deezer";

// deezer.ts imports the prisma-backed cache at module top; the functions under
// test are pure, so stub the cache out of the module graph.
vi.mock("@/lib/cache", () => ({
  withCache: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(),
}));

describe("normalizeTrackTitle", () => {
  it("lowercases and trims", () => {
    expect(normalizeTrackTitle("  Bohemian Rhapsody  ")).toBe(
      "bohemian rhapsody",
    );
  });

  it("strips parenthesised extras like (Remastered)", () => {
    expect(normalizeTrackTitle("Song (Remastered 2011)")).toBe("song");
    expect(normalizeTrackTitle("Song (feat. Other Artist)")).toBe("song");
  });

  it("strips bracketed extras like [Explicit]", () => {
    expect(normalizeTrackTitle("Song [Explicit]")).toBe("song");
    expect(normalizeTrackTitle("Song [Radio Edit]")).toBe("song");
  });

  it("strips extras mid-title, not just at the end", () => {
    expect(normalizeTrackTitle("Song (Live) Version")).toBe("song version");
  });

  it("keeps text after an unbalanced opening paren", () => {
    // The regex needs a closing paren, so "(Live" survives as a word —
    // malformed metadata degrades to a looser match, not an empty key.
    expect(normalizeTrackTitle("Song (Live")).toBe("song live");
  });

  it("replaces punctuation with single spaces", () => {
    expect(normalizeTrackTitle("Rock 'n' Roll")).toBe("rock n roll");
    expect(normalizeTrackTitle("Stop!  Go...")).toBe("stop go");
  });

  it("preserves unicode letters and digits", () => {
    expect(normalizeTrackTitle("Café del Mar")).toBe("café del mar");
    expect(normalizeTrackTitle("日本語のタイトル")).toBe("日本語のタイトル");
    expect(normalizeTrackTitle("99 Luftballons")).toBe("99 luftballons");
  });

  it("maps an empty string to an empty string", () => {
    expect(normalizeTrackTitle("")).toBe("");
  });
});

describe("trackMatchKey", () => {
  it("joins normalized artist and title with a pipe", () => {
    expect(trackMatchKey("Radiohead", "Creep")).toBe("radiohead|creep");
  });

  it("is case-insensitive", () => {
    expect(trackMatchKey("RADIOHEAD", "CREEP")).toBe(
      trackMatchKey("radiohead", "creep"),
    );
  });

  it("folds diacritics so accented and unaccented spellings match", () => {
    expect(trackMatchKey("Beyoncé", "Déjà Vu")).toBe("beyonce|deja vu");
    expect(trackMatchKey("Beyoncé", "Déjà Vu")).toBe(
      trackMatchKey("Beyonce", "Deja Vu"),
    );
  });

  it("treats a ' - YYYY Remaster' suffix as the same song", () => {
    expect(trackMatchKey("Artist", "Song - 2024 Remaster")).toBe(
      trackMatchKey("Artist", "Song"),
    );
  });

  it("treats a ' - Live at X' suffix as the same song", () => {
    expect(trackMatchKey("Artist", "Song - Live at Wembley")).toBe(
      trackMatchKey("Artist", "Song"),
    );
  });

  it("does NOT strip a hyphen suffix without surrounding spaces", () => {
    expect(trackMatchKey("Artist", "Song-Remaster")).not.toBe(
      trackMatchKey("Artist", "Song"),
    );
  });

  it("drops feat./ft./featuring credits from the title", () => {
    const plain = trackMatchKey("Artist", "Song");
    expect(trackMatchKey("Artist", "Song feat. Guest")).toBe(plain);
    expect(trackMatchKey("Artist", "Song ft Guest")).toBe(plain);
    expect(trackMatchKey("Artist", "Song featuring Guest")).toBe(plain);
  });

  it("does not mangle words that merely start with feat/ft", () => {
    expect(trackMatchKey("Artist", "Feather")).toBe("artist|feather");
  });

  it("equates '&' with 'and'", () => {
    expect(trackMatchKey("Tom & Jerry", "Song")).toBe(
      trackMatchKey("Tom and Jerry", "Song"),
    );
  });

  it("equates parenthesised and bracketed extras with the plain title", () => {
    const plain = trackMatchKey("Artist", "Song");
    expect(trackMatchKey("Artist", "Song (Acoustic)")).toBe(plain);
    expect(trackMatchKey("Artist", "Song [Demo]")).toBe(plain);
  });

  it("keeps genuinely different songs distinct", () => {
    expect(trackMatchKey("Artist", "Song One")).not.toBe(
      trackMatchKey("Artist", "Song Two"),
    );
  });
});
