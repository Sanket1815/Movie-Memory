import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VALID = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  AUTH_SECRET: "secret",
  AUTH_GOOGLE_ID: "google-id",
  AUTH_GOOGLE_SECRET: "google-secret",
  OPENAI_API_KEY: "sk-test",
};

describe("getEnv", () => {
  beforeEach(() => {
    // getEnv() memoizes, so each test needs a fresh copy of the module.
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function loadWith(env: Record<string, string>) {
    for (const key of [...Object.keys(VALID), "OPENAI_MODEL"]) vi.stubEnv(key, "");
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const { getEnv } = await import("@/lib/env");
    return getEnv;
  }

  it("returns parsed values and defaults OPENAI_MODEL", async () => {
    const getEnv = await loadWith(VALID);
    expect(getEnv()).toMatchObject({ ...VALID, OPENAI_MODEL: "gpt-6-luna" });
  });

  it("lists every missing variable in one error", async () => {
    const getEnv = await loadWith({ DATABASE_URL: VALID.DATABASE_URL });
    expect(getEnv).toThrowError(/AUTH_SECRET[\s\S]*AUTH_GOOGLE_ID[\s\S]*OPENAI_API_KEY/);
  });

  it("never echoes secret values in the error", async () => {
    const getEnv = await loadWith({ ...VALID, OPENAI_API_KEY: "" });
    expect(getEnv).toThrowError(/OPENAI_API_KEY/);
    expect(getEnv).not.toThrowError(/google-secret/);
  });
});
