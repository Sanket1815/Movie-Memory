// Runs before every test file (vitest.config.mts > setupFiles).
import "dotenv/config";

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  throw new Error("DATABASE_URL_TEST is not set. Tests need their own database (see .env.example).");
}

// Point the app's default Prisma client (lib/db.ts) at the test database too, so code under
// test that uses the default client can never touch development data.
process.env.DATABASE_URL = testUrl;

// lib/env.ts requires these at runtime. Tests never call Google or OpenAI (both are mocked),
// so placeholders are fine when they're not set (e.g. in CI).
process.env.AUTH_SECRET ||= "test-auth-secret";
process.env.AUTH_GOOGLE_ID ||= "test-google-id";
process.env.AUTH_GOOGLE_SECRET ||= "test-google-secret";
process.env.OPENAI_API_KEY ||= "test-openai-key";
