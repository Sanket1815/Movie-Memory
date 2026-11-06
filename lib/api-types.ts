// JSON contract of GET /api/fact, shared by the route handler and the FactCard client.
import type { ErrorBody } from "@/lib/errors";

export type FactSource = "fresh" | "cache" | "stale";

/** 200 OK */
export type FactSuccessBody = {
  fact: { content: string; createdAt: string /* ISO 8601 */ };
  source: FactSource;
};

/** 401 UNAUTHENTICATED, 409 NO_MOVIE, 202 GENERATION_IN_PROGRESS, 503 GENERATION_FAILED, 500 */
export type FactErrorBody = ErrorBody;
