"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FactErrorBody, FactSource, FactSuccessBody } from "@/lib/api-types";

type State =
  | { status: "loading" }
  | { status: "ready"; content: string; source: FactSource }
  | { status: "error"; message: string };

const GENERIC_ERROR = "We couldn't load a fact right now. Please try again.";
const IN_PROGRESS_RETRY_MS = 1_500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as Partial<FactErrorBody>;
    return body.error?.message ?? GENERIC_ERROR;
  } catch {
    return GENERIC_ERROR;
  }
}

/**
 * Fetches the fact from GET /api/fact. The server owns all caching decisions (60s window,
 * one generation at a time); this component only renders what it gets back.
 */
async function fetchFact(signal: AbortSignal): Promise<State | "unauthenticated"> {
  // A 202 means another tab/request is generating right now: wait and retry once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch("/api/fact", { cache: "no-store", signal });
    if (res.status === 202 && attempt === 0) {
      await sleep(IN_PROGRESS_RETRY_MS);
      continue;
    }
    if (res.status === 401) return "unauthenticated";
    if (res.ok && res.status === 200) {
      const body = (await res.json()) as FactSuccessBody;
      return { status: "ready", content: body.fact.content, source: body.source };
    }
    return { status: "error", message: await readErrorMessage(res) };
  }
  return { status: "error", message: GENERIC_ERROR };
}

const SOURCE_BADGE: Record<FactSource, { label: string; emoji: string; className: string }> = {
  fresh: { label: "Fresh off the reel", emoji: "✨", className: "border-mint/40 bg-mint/15 text-mint" },
  cache: { label: "From the last minute", emoji: "🎟️", className: "border-sky/40 bg-sky/15 text-sky" },
  stale: { label: "A recent one", emoji: "📼", className: "border-popcorn/40 bg-popcorn/15 text-popcorn" },
};

export function FactCard() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    // Cancel any in-flight request so a slow older response can't overwrite a newer one.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    fetchFact(controller.signal)
      .then((next) => {
        if (next === "unauthenticated") router.replace("/"); // session expired: sign in again
        else setState(next);
      })
      .catch(() => {
        if (controller.signal.aborted) return; // superseded or unmounted: ignore
        setState({ status: "error", message: GENERIC_ERROR });
      })
      .finally(() => {
        if (controllerRef.current === controller) setIsRefreshing(false);
      });
  }, [router]);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  function refresh() {
    setIsRefreshing(true);
    // Keep showing the current fact while a new one loads; only show the skeleton if
    // there's nothing to show yet.
    if (state.status !== "ready") setState({ status: "loading" });
    load();
  }

  const busy = state.status === "loading" || isRefreshing;

  return (
    <section
      aria-labelledby="fact-heading"
      aria-busy={busy}
      className="film-strip mt-8 animate-pop-in [animation-delay:160ms]"
    >
      <div className="panel rounded-2xl p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="fact-heading" className="flex items-center gap-2 font-display text-xl font-bold">
            <span aria-hidden="true" className="text-2xl">
              🍿
            </span>
            Fun fact
          </h2>
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            className="btn-pop px-4 py-2 text-sm"
          >
            <span aria-hidden="true" className={busy ? "inline-block animate-spin" : "inline-block"}>
              🎞️
            </span>
            {isRefreshing ? "Rolling…" : "New fact"}
          </button>
        </div>

        <div aria-live="polite" className="mt-5 min-h-24">
          {state.status === "loading" && (
            <div aria-label="Loading fact" className="space-y-3">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-11/12" />
              <div className="skeleton h-4 w-2/3" />
              <p className="pt-1 font-display text-sm text-muted">Rolling the projector…</p>
            </div>
          )}

          {state.status === "ready" && (
            <div key={state.content} className="animate-pop-in">
              {/* Plain text rendering: model output is never interpreted as HTML. */}
              <p className="text-lg leading-relaxed text-cream sm:text-xl">{state.content}</p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-display text-xs font-semibold ${SOURCE_BADGE[state.source].className}`}
                >
                  <span aria-hidden="true">{SOURCE_BADGE[state.source].emoji}</span>
                  {SOURCE_BADGE[state.source].label}
                </span>
                {state.source === "stale" && (
                  <p className="text-sm text-popcorn-soft">
                    Showing a recent fact. We couldn&apos;t fetch a new one just now.
                  </p>
                )}
                {state.source === "cache" && !isRefreshing && (
                  <p className="text-sm text-muted">New facts are available once a minute.</p>
                )}
              </div>
            </div>
          )}

          {state.status === "error" && (
            <div role="alert" className="rounded-2xl border border-cherry/40 bg-cherry/10 p-5">
              <p className="font-display text-lg font-bold text-cherry">
                <span aria-hidden="true">🎬</span> Cut!
              </p>
              <p className="mt-1 text-cream">{state.message}</p>
              <button type="button" onClick={refresh} className="btn-pop mt-4 px-5 py-2 text-sm">
                Retry <span aria-hidden="true">🔁</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
