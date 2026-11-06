import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { db as defaultDb } from "@/lib/db";
import { generateMovieFact } from "@/lib/openai";

/** A fact younger than this is served from the DB instead of calling OpenAI. */
export const CACHE_WINDOW_MS = 60_000;
/**
 * How long a generation lease lasts. Must exceed the worst-case generation time
 * (GENERATION_DEADLINE_MS = 8s in lib/openai.ts), so a live lease never expires mid-call.
 * If a process crashes while holding it, other requests can generate again after this.
 */
export const LEASE_SECONDS = 15;

export type Fact = { id: string; content: string; createdAt: Date };

export type FactErrorCode = "NO_MOVIE" | "GENERATION_IN_PROGRESS" | "GENERATION_FAILED";

export type FactResult =
  | { ok: true; fact: Fact; source: "fresh" | "cache" | "stale" }
  | { ok: false; error: { code: FactErrorCode; message: string } };

export type FactDeps = {
  /** App clock used for the 60s cache window (injectable so tests can control time). */
  now?: () => Date;
  generate?: (movie: string) => Promise<string>;
  db?: PrismaClient;
  /** While another request holds the lease, how often / how long to wait for its result. */
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
};

const MESSAGES: Record<FactErrorCode, string> = {
  NO_MOVIE: "Add a favorite movie first.",
  GENERATION_IN_PROGRESS: "We're still coming up with your fact. One moment…",
  GENERATION_FAILED: "We couldn't come up with a fact right now. Please try again in a moment.",
};

const fail = (code: FactErrorCode): FactResult => ({
  ok: false,
  error: { code, message: MESSAGES[code] },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns a fun fact for the user's current favorite movie.
 *
 * - Cache: a fact for (user, movie) younger than 60s is returned without calling OpenAI.
 * - Concurrency: only the request holding the user's FactLock lease may generate; others
 *   wait briefly for its result. Works across server instances because the lock is in
 *   Postgres, and no DB connection or transaction is held open during the OpenAI call.
 * - Failure: if OpenAI fails, fall back to the latest saved fact ("stale"), if any.
 *
 * Every query is scoped by `userId`, which callers must take from the session only.
 */
export async function getFact(userId: string, deps: FactDeps = {}): Promise<FactResult> {
  const {
    now = () => new Date(),
    generate = generateMovieFact,
    db = defaultDb,
    pollIntervalMs = 300,
    pollTimeoutMs = 3_000,
  } = deps;

  // 1. The user's current movie (by id only).
  const user = await db.user.findUnique({ where: { id: userId }, select: { favoriteMovie: true } });
  const movie = user?.favoriteMovie;
  if (!movie) return fail("NO_MOVIE");

  const latestFact = () =>
    db.fact.findFirst({
      where: { userId, movie },
      orderBy: { createdAt: "desc" },
      select: { id: true, content: true, createdAt: true },
    });
  // Strictly less than 60s: a fact exactly 60s old counts as expired.
  const isFresh = (fact: Fact | null): fact is Fact =>
    fact !== null && now().getTime() - fact.createdAt.getTime() < CACHE_WINDOW_MS;

  // 2. Cache hit: no lock, no OpenAI call.
  const cached = await latestFact();
  if (isFresh(cached)) return { ok: true, fact: cached, source: "cache" };

  // 3. Try to take the lease with ONE atomic statement. Two requests can't both win: the
  //    INSERT ... ON CONFLICT serializes on the primary key. The conditional DO UPDATE only
  //    takes over a row whose lease has already expired (e.g. its holder crashed).
  //    Lease times use the DB clock (now()) so every server instance agrees on them.
  const acquired = await db.$queryRaw<{ lockedUntil: Date }[]>`
    INSERT INTO "FactLock" ("userId", "lockedUntil")
    VALUES (${userId}, now() + make_interval(secs => ${LEASE_SECONDS}))
    ON CONFLICT ("userId") DO UPDATE SET "lockedUntil" = EXCLUDED."lockedUntil"
    WHERE "FactLock"."lockedUntil" < now()
    RETURNING "lockedUntil"`;

  // 4. Someone else is generating: wait briefly for their fact rather than making another.
  if (acquired.length === 0) {
    const waitUntil = Date.now() + pollTimeoutMs;
    while (Date.now() < waitUntil) {
      await sleep(pollIntervalMs);
      const fact = await latestFact();
      if (isFresh(fact)) return { ok: true, fact, source: "cache" };
    }
    const fallback = await latestFact();
    return fallback ? { ok: true, fact: fallback, source: "stale" } : fail("GENERATION_IN_PROGRESS");
  }

  // Our lease's expiry doubles as a fencing token for the release below.
  const leaseToken = acquired[0]!.lockedUntil;

  try {
    // 5. Re-check after acquiring: a request that held the lease just before us may have
    //    saved a fresh fact between our step-2 check and our acquiring the lease.
    const recheck = await latestFact();
    if (isFresh(recheck)) return { ok: true, fact: recheck, source: "cache" };

    // 6. Generate and save. `movie` is the value read in step 1, so a fact can never be
    //    saved under a different movie than the one it was generated for.
    let content: string;
    try {
      content = await generate(movie);
    } catch (err) {
      // 7. OpenAI failed: serve the last saved fact if there is one.
      console.warn("getFact: generation failed", { userId, reason: describe(err) });
      return recheck ? { ok: true, fact: recheck, source: "stale" } : fail("GENERATION_FAILED");
    }

    const fact = await db.fact.create({
      // createdAt is set from the same clock the cache check uses, so they can't disagree.
      data: { userId, movie, content, createdAt: now() },
      select: { id: true, content: true, createdAt: true },
    });
    return { ok: true, fact, source: "fresh" };
  } finally {
    // 8. Always release. Matching on our own expiry means that if our lease had somehow
    //    expired and another request took it over, we don't delete *their* lease.
    //    A failed release is logged, not thrown: it must not turn a good result into an
    //    error, and the lease expires on its own after LEASE_SECONDS anyway.
    try {
      await db.$executeRaw`
        DELETE FROM "FactLock" WHERE "userId" = ${userId} AND "lockedUntil" = ${leaseToken}`;
    } catch (err) {
      console.error("getFact: failed to release lease", { userId, reason: describe(err) });
    }
  }
}

/** Log-safe description of an error (no stack traces or provider response bodies). */
function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown error";
}
