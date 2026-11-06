import "server-only";
import { z } from "zod";

// Empty strings (e.g. `OPENAI_MODEL=""` copied from .env.example) are treated as "not set".
const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const required = z.string({ error: "is required" }).trim().min(1, "is required");

const envSchema = z.object({
  DATABASE_URL: required,
  AUTH_SECRET: required,
  AUTH_GOOGLE_ID: required,
  AUTH_GOOGLE_SECRET: required,
  OPENAI_API_KEY: required,
  OPENAI_MODEL: optional.transform((v) => v ?? "gpt-6-luna"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validated server environment. Parsed lazily (once) rather than at import time so that
 * `next build` and unit tests don't need real secrets. `instrumentation.ts` calls this on
 * server startup, so a misconfigured server still fails fast with a readable message.
 */
export function getEnv(): Env {
  if (cached) return cached;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment variables:\n${problems}\nCopy .env.example to .env and fill in the values.`,
    );
  }

  cached = result.data;
  return cached;
}
