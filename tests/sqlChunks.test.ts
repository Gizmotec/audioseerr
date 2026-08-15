import { describe, expect, it } from "vitest";
import { chunkForSql } from "@/lib/sqlChunks";

describe("chunkForSql", () => {
  it("returns nothing for an empty list", () => {
    expect(chunkForSql([])).toEqual([]);
  });

  it("leaves a list that already fits as a single batch", () => {
    expect(chunkForSql([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it("keeps every batch under SQLite's 999-parameter ceiling", () => {
    const ids = Array.from({ length: 5000 }, (_, i) => i);
    const batches = chunkForSql(ids);
    expect(batches.every((b) => b.length < 999)).toBe(true);
  });

  it("preserves order and loses nothing across batches", () => {
    const ids = Array.from({ length: 5000 }, (_, i) => i);
    expect(chunkForSql(ids).flat()).toEqual(ids);
  });

  it("splits exactly on the boundary rather than emitting an empty batch", () => {
    expect(chunkForSql([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(chunkForSql([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
});
