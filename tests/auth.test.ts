// Route-level tests for GET /api/fact. Only the edges are mocked: Auth.js's auth() (who is
// signed in) and OpenAI. requireUser(), getFact() and Postgres all run for real.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { createFact, createUser, resetDb, testDb } from "./helpers/db";

const { mockAuth, mockGenerate } = vi.hoisted(() => ({
  mockAuth: vi.fn<() => Promise<Session | null>>(),
  mockGenerate: vi.fn<(movie: string) => Promise<string>>(),
}));

// next-auth is replaced wholesale: NextAuth() returns our mock auth(), so lib/auth.ts's real
// getCurrentUser()/requireUser() run on top of it.
vi.mock("next-auth", () => ({
  default: () => ({ handlers: {}, auth: mockAuth, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/google", () => ({ default: {} }));
vi.mock("@/lib/openai", () => ({ generateMovieFact: mockGenerate }));

const { GET } = await import("@/app/api/fact/route");

function signInAs(user: { id: string; email: string | null } | null) {
  mockAuth.mockResolvedValue(
    user ? { user: { id: user.id, email: user.email }, expires: "2099-01-01T00:00:00.000Z" } : null,
  );
}

const call = (query = "") => GET(new Request(`http://localhost/api/fact${query}`));

beforeEach(async () => {
  await resetDb();
  mockAuth.mockReset();
  mockGenerate.mockReset();
  mockGenerate.mockImplementation(async (movie) => `A fun fact about ${movie}.`);
});
afterAll(() => testDb.$disconnect());

describe("GET /api/fact authorization", () => {
  it("returns 401 with the standard error shape when there is no session", async () => {
    signInAs(null);

    const res = await call();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Please sign in to continue." },
    });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("returns 401 for a session without a user id", async () => {
    mockAuth.mockResolvedValue({ user: {}, expires: "2099-01-01T00:00:00.000Z" } as Session);

    expect((await call()).status).toBe(401);
  });

  it("ignores a userId in the query string and serves only the session user's fact", async () => {
    const alice = await createUser("alice@example.com", "Alien");
    const bob = await createUser("bob@example.com", "Alien");
    await createFact(alice.id, "Alien", "Alice's private fact.", new Date());
    signInAs(bob);

    const res = await call(`?userId=${alice.id}`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fact.content).toBe("A fun fact about Alien.");
    expect(body.fact.content).not.toContain("Alice");
    // The fact Bob received was generated for and stored under Bob.
    const stored = await testDb.fact.findMany({ where: { content: body.fact.content } });
    expect(stored.map((f) => f.userId)).toEqual([bob.id]);
  });

  it("an unauthenticated request with a userId still gets 401, not that user's fact", async () => {
    const alice = await createUser("alice@example.com", "Alien");
    await createFact(alice.id, "Alien", "Alice's private fact.", new Date());
    signInAs(null);

    const res = await call(`?userId=${alice.id}`);

    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain("Alice");
  });
});

describe("GET /api/fact response mapping", () => {
  it("returns 200 with the fact, its source and no-store caching", async () => {
    const user = await createUser("a@example.com", "Alien");
    signInAs(user);

    const res = await call();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({
      fact: { content: "A fun fact about Alien.", createdAt: expect.any(String) },
      source: "fresh",
    });
    expect(Number.isNaN(Date.parse(body.fact.createdAt))).toBe(false);
  });

  it("returns 409 NO_MOVIE for a user who hasn't onboarded", async () => {
    signInAs(await createUser("a@example.com", null));

    const res = await call();

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NO_MOVIE");
  });

  it("returns 503 with a friendly message when OpenAI fails and nothing is cached", async () => {
    vi.spyOn(console, "warn").mockImplementationOnce(() => {});
    signInAs(await createUser("a@example.com", "Alien"));
    mockGenerate.mockRejectedValue(new Error("upstream exploded: secret details"));

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error.code).toBe("GENERATION_FAILED");
    expect(JSON.stringify(body)).not.toContain("secret details");
  });

  it("returns a generic 500 for unexpected errors without leaking details", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    signInAs(await createUser("a@example.com", "Alien"));
    const findUnique = vi
      .spyOn(testDb.user, "findUnique")
      .mockRejectedValueOnce(new Error("connection to 10.0.0.5:5432 refused"));

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } });
    findUnique.mockRestore();
  });
});
