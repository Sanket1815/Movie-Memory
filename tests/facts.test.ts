import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CACHE_WINDOW_MS, getFact, type FactDeps } from "@/lib/facts";
import { FactGenerationError } from "@/lib/openai";
import { createFact, createUser, leaseCount, resetDb, setLease, testDb } from "./helpers/db";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

/** Deps with a fixed clock and a mock generator; fast polling keeps tests quick. */
function deps({ generate: customGenerate, ...overrides }: Partial<FactDeps> = {}) {
  const generate = vi.fn(customGenerate ?? (async (movie: string) => `A fun fact about ${movie}.`));
  return {
    /** The generator actually used, so tests can assert on its calls. */
    generate,
    deps: {
      db: testDb,
      now: () => NOW,
      generate,
      pollIntervalMs: 20,
      pollTimeoutMs: 300,
      ...overrides,
    } satisfies FactDeps,
  };
}

beforeEach(resetDb);
afterAll(() => testDb.$disconnect());
// Silence the expected "generation failed" warnings from failure-path tests.
vi.spyOn(console, "warn").mockImplementation(() => {});

describe("60-second cache window", () => {
  it("returns a 59s-old fact from cache without calling OpenAI", async () => {
    const user = await createUser("a@example.com", "Alien");
    const existing = await createFact(user.id, "Alien", "Cached fact.", ago(59_000));
    const { deps: d, generate } = deps();

    const result = await getFact(user.id, d);

    expect(result).toMatchObject({ ok: true, source: "cache", fact: { id: existing.id } });
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    ["exactly 60s", CACHE_WINDOW_MS],
    ["61s", 61_000],
  ])("generates a new fact when the latest is %s old", async (_label, age) => {
    const user = await createUser("a@example.com", "Alien");
    await createFact(user.id, "Alien", "Old fact.", ago(age));
    const { deps: d, generate } = deps();

    const result = await getFact(user.id, d);

    expect(generate).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ ok: true, source: "fresh", fact: { content: "A fun fact about Alien." } });
    // The new fact is stored, timestamped with the same clock the cache check uses.
    const stored = await testDb.fact.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    expect(stored).toHaveLength(2);
    expect(stored[0]?.createdAt).toEqual(NOW);
  });

  it("generates (and caches) the first fact when none exists", async () => {
    const user = await createUser("a@example.com", "Alien");
    const { deps: d, generate } = deps();

    const first = await getFact(user.id, d);
    const second = await getFact(user.id, d);

    expect(first).toMatchObject({ ok: true, source: "fresh" });
    expect(second).toMatchObject({ ok: true, source: "cache" });
    expect(generate).toHaveBeenCalledOnce();
  });

  it("ignores a fresh fact for the old movie after the movie changes", async () => {
    const user = await createUser("a@example.com", "Heat");
    await createFact(user.id, "Alien", "Fresh fact about the OLD movie.", ago(5_000));
    const { deps: d, generate } = deps();

    const result = await getFact(user.id, d);

    expect(generate).toHaveBeenCalledWith("Heat");
    expect(result).toMatchObject({ ok: true, source: "fresh", fact: { content: "A fun fact about Heat." } });
  });

  it("returns NO_MOVIE when the user has no favorite movie", async () => {
    const user = await createUser("a@example.com", null);
    const { deps: d, generate } = deps();

    expect(await getFact(user.id, d)).toMatchObject({ ok: false, error: { code: "NO_MOVIE" } });
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("burst / concurrency protection", () => {
  it("5 concurrent requests trigger exactly one generation and all get the same fact", async () => {
    const user = await createUser("a@example.com", "Alien");
    // Slow generator so every request arrives while the first is still generating.
    const generate = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return "The one and only fact.";
    });
    const { deps: d } = deps({ generate, pollTimeoutMs: 2_000 });

    const results = await Promise.all(Array.from({ length: 5 }, () => getFact(user.id, d)));

    expect(generate).toHaveBeenCalledOnce();
    const ids = results.map((r) => (r.ok ? r.fact.id : r.error.code));
    expect(new Set(ids).size).toBe(1);
    expect(results.filter((r) => r.ok && r.source === "fresh")).toHaveLength(1);
    expect(await testDb.fact.count()).toBe(1);
    expect(await leaseCount()).toBe(0);
  });

  it("re-checks the cache after acquiring the lease (a fact may have landed in between)", async () => {
    const user = await createUser("a@example.com", "Alien");
    // Reproduce the race deterministically: our cache check misses, then another request
    // finishes generating and releases the lease just before we acquire it.
    const realQueryRaw = testDb.$queryRaw.bind(testDb);
    const leaseQuery = vi.spyOn(testDb, "$queryRaw").mockImplementationOnce((async (
      ...args: Parameters<typeof testDb.$queryRaw>
    ) => {
      await createFact(user.id, "Alien", "Fact from the other request.", ago(100));
      return realQueryRaw(...args);
    }) as typeof testDb.$queryRaw);
    const { deps: d, generate } = deps();

    const result = await getFact(user.id, d);

    expect(leaseQuery).toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, source: "cache", fact: { content: "Fact from the other request." } });
    expect(await leaseCount()).toBe(0);
    leaseQuery.mockRestore();
  });

  it("re-acquires an expired lease (e.g. its holder crashed)", async () => {
    const user = await createUser("a@example.com", "Alien");
    await setLease(user.id, -1); // expired one second ago
    const { deps: d, generate } = deps();

    const result = await getFact(user.id, d);

    expect(result).toMatchObject({ ok: true, source: "fresh" });
    expect(generate).toHaveBeenCalledOnce();
    expect(await leaseCount()).toBe(0);
  });

  it("does not generate while another request holds a live lease", async () => {
    const user = await createUser("a@example.com", "Alien");
    await setLease(user.id, 15);
    const { deps: d, generate } = deps();

    const result = await getFact(user.id, d);

    expect(generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: { code: "GENERATION_IN_PROGRESS" } });
    // We never held it, so we must not have released someone else's lease.
    expect(await leaseCount()).toBe(1);
  });

  it("serves the latest fact as stale while another request holds the lease", async () => {
    const user = await createUser("a@example.com", "Alien");
    const old = await createFact(user.id, "Alien", "Old fact.", ago(5 * 60_000));
    await setLease(user.id, 15);
    const { deps: d, generate } = deps();

    const result = await getFact(user.id, d);

    expect(generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, source: "stale", fact: { id: old.id } });
  });
});

describe("failure handling", () => {
  it.each([
    ["throws", new Error("network down")],
    ["times out", new FactGenerationError("timeout")],
  ])("returns the latest fact as stale when OpenAI %s", async (_label, error) => {
    const user = await createUser("a@example.com", "Alien");
    const old = await createFact(user.id, "Alien", "Old fact.", ago(5 * 60_000));
    const { deps: d } = deps({ generate: vi.fn().mockRejectedValue(error) });

    const result = await getFact(user.id, d);

    expect(result).toMatchObject({ ok: true, source: "stale", fact: { id: old.id, content: "Old fact." } });
    expect(await testDb.fact.count()).toBe(1); // nothing new was stored
  });

  it("returns a friendly GENERATION_FAILED when OpenAI fails and there is no fact", async () => {
    const user = await createUser("a@example.com", "Alien");
    const { deps: d } = deps({ generate: vi.fn().mockRejectedValue(new Error("boom")) });

    const result = await getFact(user.id, d);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "GENERATION_FAILED",
        message: "We couldn't come up with a fact right now. Please try again in a moment.",
      },
    });
  });

  it("does not fall back to a fact for a different (previous) movie", async () => {
    const user = await createUser("a@example.com", "Heat");
    await createFact(user.id, "Alien", "Fact about the old movie.", ago(5 * 60_000));
    const { deps: d } = deps({ generate: vi.fn().mockRejectedValue(new Error("boom")) });

    expect(await getFact(user.id, d)).toMatchObject({ ok: false, error: { code: "GENERATION_FAILED" } });
  });

  it("releases the lease after success and after failure", async () => {
    const user = await createUser("a@example.com", "Alien");

    await getFact(user.id, deps().deps);
    expect(await leaseCount()).toBe(0);

    const failing = deps({ now: () => new Date(NOW.getTime() + 2 * CACHE_WINDOW_MS) });
    failing.generate.mockRejectedValue(new Error("boom"));
    const result = await getFact(user.id, failing.deps);
    expect(failing.generate).toHaveBeenCalledOnce(); // it really did take the lease and try
    expect(result).toMatchObject({ ok: true, source: "stale" });
    expect(await leaseCount()).toBe(0);
  });

  it("propagates unexpected DB errors (route maps them to 500) and still releases the lease", async () => {
    const user = await createUser("a@example.com", "Alien");
    // Generation succeeds, but saving the fact fails (e.g. the DB connection drops).
    const create = vi.spyOn(testDb.fact, "create").mockRejectedValueOnce(new Error("db down"));

    await expect(getFact(user.id, deps().deps)).rejects.toThrow("db down");
    expect(create).toHaveBeenCalledOnce();
    expect(await leaseCount()).toBe(0);
    create.mockRestore();
  });
});

describe("authorization (data isolation)", () => {
  it("user B never receives user A's facts, even for the same movie", async () => {
    const alice = await createUser("alice@example.com", "Alien");
    const bob = await createUser("bob@example.com", "Alien");
    await createFact(alice.id, "Alien", "Alice's private fact.", ago(1_000));
    const { deps: d, generate } = deps({ generate: vi.fn(async () => "Bob's own fact.") });

    const result = await getFact(bob.id, d);

    expect(generate).toHaveBeenCalledOnce(); // Alice's fresh fact is not Bob's cache hit
    expect(result).toMatchObject({ ok: true, source: "fresh", fact: { content: "Bob's own fact." } });
  });

  it("user B's failure fallback never uses user A's facts", async () => {
    const alice = await createUser("alice@example.com", "Alien");
    const bob = await createUser("bob@example.com", "Alien");
    await createFact(alice.id, "Alien", "Alice's private fact.", ago(5 * 60_000));
    const { deps: d } = deps({ generate: vi.fn().mockRejectedValue(new Error("boom")) });

    expect(await getFact(bob.id, d)).toMatchObject({ ok: false, error: { code: "GENERATION_FAILED" } });
  });

  it("one user's lease does not block another user", async () => {
    const alice = await createUser("alice@example.com", "Alien");
    const bob = await createUser("bob@example.com", "Alien");
    await setLease(alice.id, 15);
    const { deps: d } = deps();

    expect(await getFact(bob.id, d)).toMatchObject({ ok: true, source: "fresh" });
  });
});
