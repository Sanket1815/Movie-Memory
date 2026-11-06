import type { FactSuccessBody } from "@/lib/api-types";
import { requireUser } from "@/lib/auth";
import { AppError, errorResponse } from "@/lib/errors";
import { getFact, type FactErrorCode } from "@/lib/facts";

export const runtime = "nodejs"; // Prisma + OpenAI SDK need Node.js, not Edge.

const STATUS: Record<FactErrorCode, number> = {
  NO_MOVIE: 409, // valid request, but the user's state doesn't allow it yet
  GENERATION_IN_PROGRESS: 202, // accepted; another request is generating, retry shortly
  GENERATION_FAILED: 503, // upstream (OpenAI) unavailable and nothing cached to fall back on
};

// The request is deliberately never read: the user comes only from the session cookie, so
// there is no userId in the query, body or headers that a caller could swap for someone else's.
export async function GET(_request: Request) {
  try {
    const user = await requireUser();
    const result = await getFact(user.id);

    if (!result.ok) {
      return errorResponse(result.error.code, result.error.message, STATUS[result.error.code]);
    }

    const body: FactSuccessBody = {
      fact: { content: result.fact.content, createdAt: result.fact.createdAt.toISOString() },
      source: result.source,
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof AppError && err.code === "UNAUTHENTICATED") {
      return errorResponse("UNAUTHENTICATED", err.message, 401);
    }
    // Unexpected (e.g. DB down): full detail stays in server logs, the client gets a generic message.
    console.error("GET /api/fact failed", err);
    return errorResponse("INTERNAL", "Something went wrong. Please try again.", 500);
  }
}
