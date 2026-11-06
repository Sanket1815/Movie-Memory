// Next.js calls register() once when a server instance starts (not during `next build`).
// Validating env here makes a misconfigured deployment fail immediately with a clear
// message instead of on the first request that happens to need a missing variable.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("./lib/env");
    getEnv();
  }
}
