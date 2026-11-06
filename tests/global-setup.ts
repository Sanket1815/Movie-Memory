// Runs once before the whole suite (vitest.config.mts > globalSetup): brings the test
// database up to the latest migrations, so `npm test` works on a fresh clone and the test
// schema can never drift from prisma/migrations.
import { execSync } from "node:child_process";
import "dotenv/config";

export default function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error("DATABASE_URL_TEST is not set. Tests need their own database (see .env.example).");
  }
  if (!new URL(url).pathname.replace(/^\//, "").endsWith("_test")) {
    throw new Error("DATABASE_URL_TEST must point at a database whose name ends in _test.");
  }
  // `migrate deploy` only applies pending migrations; it never resets or drops data.
  execSync("npx prisma migrate deploy", {
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, DATABASE_URL: url },
  });
}
