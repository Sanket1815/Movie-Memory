// Unit tests for the OpenAI wrapper. The SDK client is faked (no network); the SDK's real
// error classes are kept so error mapping is tested against what the SDK actually throws.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openai")>();
  const Real = actual.default;
  class FakeOpenAI {
    static APIError = Real.APIError;
    static APIConnectionTimeoutError = Real.APIConnectionTimeoutError;
    responses = { create: mockCreate };
  }
  return { ...actual, default: FakeOpenAI };
});

const { default: OpenAI } = await vi.importActual<typeof import("openai")>("openai");
const { generateMovieFact, sanitizeFact, FactGenerationError, GENERATION_DEADLINE_MS } =
  await import("@/lib/openai");

// Braces matter: if a beforeEach callback returns a function, Vitest calls it as a cleanup
// hook after the test, and mockReset() returns the mock itself.
beforeEach(() => {
  mockCreate.mockReset();
});

describe("sanitizeFact (model output is untrusted)", () => {
  it("collapses whitespace and strips wrapping quotes", () => {
    expect(sanitizeFact('  "The film\n\nwas shot   in 1979."  ')).toBe("The film was shot in 1979.");
  });

  it("caps length at 500 characters on a word boundary", () => {
    const out = sanitizeFact("word ".repeat(200));
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out.endsWith("word…")).toBe(true);
  });

  it("returns empty for whitespace-only output", () => {
    expect(sanitizeFact(" \n\t ")).toBe("");
  });
});

describe("generateMovieFact", () => {
  it("returns the sanitized fact and sends safe request options", async () => {
    mockCreate.mockResolvedValue({ status: "completed", output_text: "  A  fact. " });

    await expect(generateMovieFact("Alien")).resolves.toBe("A fact.");

    const [params, options] = mockCreate.mock.calls[0]!;
    expect(params).toMatchObject({
      model: "gpt-6-luna",
      input: 'Movie title: "Alien"',
      store: false,
      max_output_tokens: expect.any(Number),
    });
    expect(options).toMatchObject({ timeout: GENERATION_DEADLINE_MS, signal: expect.any(AbortSignal) });
  });

  it("maps an SDK timeout to reason 'timeout'", async () => {
    mockCreate.mockImplementation(async () => {
      throw new OpenAI.APIConnectionTimeoutError();
    });

    await expect(generateMovieFact("Alien")).rejects.toMatchObject({ reason: "timeout" });
  });

  it("maps provider errors to 'provider_error' with only the status code", async () => {
    mockCreate.mockRejectedValue(
      OpenAI.APIError.generate(500, { message: "internal detail sk-secret" }, "server error", new Headers()),
    );

    const error = await generateMovieFact("Alien").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FactGenerationError);
    expect(error).toMatchObject({ reason: "provider_error", status: 500 });
    expect(String((error as Error).message)).not.toContain("sk-secret");
  });

  it.each([
    ["empty output", { status: "completed", output_text: "   " }],
    ["output cut off by the token limit", { status: "incomplete", output_text: "The film was" }],
  ])("rejects %s", async (_label, response) => {
    mockCreate.mockResolvedValue(response);

    await expect(generateMovieFact("Alien")).rejects.toMatchObject({ reason: "empty_output" });
  });
});
