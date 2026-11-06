"use client";

import { useActionState } from "react";
import { saveFavoriteMovie, type OnboardingState } from "@/app/onboarding/actions";
import { MOVIE_MAX_LENGTH } from "@/lib/validation";

const initialState: OnboardingState = {};

export function OnboardingForm() {
  const [state, formAction, isPending] = useActionState(saveFavoriteMovie, initialState);

  return (
    <form action={formAction} className="mt-7 space-y-4" noValidate>
      <label
        htmlFor="movie"
        className="block font-display text-sm font-semibold uppercase tracking-wider text-night-950/80"
      >
        Your favorite movie
      </label>
      <input
        id="movie"
        name="movie"
        type="text"
        // key resets the input to the echoed value after each server response.
        key={state.value}
        defaultValue={state.value}
        // maxLength is a convenience only; the server validates everything again.
        maxLength={MOVIE_MAX_LENGTH}
        autoComplete="off"
        autoFocus
        placeholder="e.g. Spirited Away"
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "movie-error" : undefined}
        className="w-full rounded-2xl border-2 border-night-950 bg-cream px-5 py-4 font-display text-lg text-night-950 shadow-[4px_4px_0_var(--color-night-950)] outline-none transition placeholder:text-night-950/40 focus-visible:-translate-x-0.5 focus-visible:-translate-y-0.5 focus-visible:shadow-[6px_6px_0_var(--color-night-950)] aria-invalid:border-night-950 aria-invalid:bg-popcorn-soft"
      />
      {state.error && (
        <p
          id="movie-error"
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-night-950 px-4 py-2.5 text-sm font-medium text-cream"
        >
          <span aria-hidden="true">🙈</span>
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="btn-pop w-full px-6 py-4 text-lg [--pop-shadow:var(--color-night-950)]"
      >
        {isPending ? (
          <>
            <span aria-hidden="true" className="inline-block animate-wiggle">
              🍿
            </span>
            Saving…
          </>
        ) : (
          <>
            Save and roll the credits <span aria-hidden="true">🎬</span>
          </>
        )}
      </button>
    </form>
  );
}
