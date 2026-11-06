import { describe, expect, it } from "vitest";
import { movieSchema } from "@/lib/validation";

describe("movieSchema", () => {
  it("trims surrounding whitespace and returns the trimmed title", () => {
    expect(movieSchema.parse("   The Matrix  ")).toBe("The Matrix");
  });

  it.each([
    ["empty", ""],
    ["spaces only", "     "],
    ["tabs and newlines only", "\t\n  \r\n"],
    ["zero-width space only", "​​"],
    ["non-breaking spaces only", "  "],
  ])("rejects %s", (_label, input) => {
    expect(movieSchema.safeParse(input).success).toBe(false);
  });

  it("rejects control characters inside a title", () => {
    expect(movieSchema.safeParse("Alien\nResurrection").success).toBe(false);
    expect(movieSchema.safeParse("Alien\u0000").success).toBe(false);
  });

  it("accepts exactly 100 characters and rejects 101", () => {
    expect(movieSchema.safeParse("a".repeat(100)).success).toBe(true);
    const result = movieSchema.safeParse("a".repeat(101));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/at most 100/);
  });

  it("measures length after trimming", () => {
    expect(movieSchema.safeParse(`  ${"a".repeat(100)}  `).success).toBe(true);
  });

  it("accepts non-ASCII titles", () => {
    expect(movieSchema.parse("千と千尋の神隠し")).toBe("千と千尋の神隠し");
    expect(movieSchema.parse("Amélie")).toBe("Amélie");
  });

  it("rejects non-string input", () => {
    expect(movieSchema.safeParse(undefined).success).toBe(false);
    expect(movieSchema.safeParse(42).success).toBe(false);
  });
});
