// One error shape for every API response, so the client only has to handle one format:
//   { "error": { "code": "UNAUTHENTICATED", "message": "Please sign in." } }

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "NO_MOVIE"
  | "GENERATION_IN_PROGRESS"
  | "GENERATION_FAILED"
  | "INTERNAL";

export type ErrorBody = { error: { code: ErrorCode; message: string } };

/** An expected, user-safe failure. `message` may be shown to the user as-is. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorResponse(code: ErrorCode, message: string, status: number): Response {
  const body: ErrorBody = { error: { code, message } };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
