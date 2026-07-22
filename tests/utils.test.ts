import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins plain class strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("returns an empty string with no inputs", () => {
    expect(cn()).toBe("");
  });

  it("drops falsy conditionals", () => {
    expect(cn("base", false && "hidden", null, undefined, "")).toBe("base");
  });

  it("supports object syntax for conditional classes", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  it("supports array syntax", () => {
    expect(cn(["a", "b"], ["c"])).toBe("a b c");
  });

  it("resolves conflicting Tailwind utilities in favor of the last one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("p-4", "p-2")).toBe("p-2");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("keeps non-conflicting utilities from the same property family", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });

  it("merges conflicts even when separated by conditionals", () => {
    expect(cn("m-1", { "m-3": true }, false && "m-2")).toBe("m-3");
  });

  it("leaves unknown/custom classes untouched", () => {
    expect(cn("my-custom-class", "p-2", "p-4")).toBe("my-custom-class p-4");
  });
});
