import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { signInWithGoogle } from "@/app/auth-actions";
import { getCurrentUser } from "@/lib/auth";

// Decorative floating emoji: position, size, tilt and animation delay.
const FLOATERS = [
  { emoji: "🍿", className: "left-[6%] top-[12%] text-6xl", tilt: "-8deg", delay: "0s" },
  { emoji: "🎬", className: "right-[8%] top-[18%] text-5xl", tilt: "10deg", delay: "1.2s" },
  { emoji: "🎞️", className: "hidden sm:block left-[10%] bottom-[14%] text-5xl", tilt: "6deg", delay: "2.1s" },
  { emoji: "⭐", className: "hidden sm:block right-[12%] bottom-[20%] text-4xl", tilt: "-12deg", delay: "0.6s" },
  { emoji: "🎟️", className: "left-[44%] top-[5%] text-4xl", tilt: "14deg", delay: "1.8s" },
];

const STEPS = [
  { emoji: "🔐", label: "Sign in" },
  { emoji: "🎬", label: "Pick your favorite" },
  { emoji: "🍿", label: "Get a fun fact" },
];

export default async function LandingPage({ searchParams }: PageProps<"/">) {
  // Signed-in users skip the landing page (redirect happens on the server, no flicker).
  if (await getCurrentUser()) redirect("/dashboard");

  // Auth.js sends failed sign-ins back here as /?error=<Code>. We show a generic message
  // rather than echoing the code: it's not meaningful to users and is attacker-controlled.
  const { error } = await searchParams;

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
        {FLOATERS.map((f) => (
          <span
            key={f.emoji}
            className={`absolute animate-float opacity-80 drop-shadow-[0_8px_16px_rgb(0_0_0/0.5)] ${f.className}`}
            // --tilt is read by the float keyframes in globals.css.
            style={{ animationDelay: f.delay, "--tilt": f.tilt } as CSSProperties}
          >
            {f.emoji}
          </span>
        ))}
      </div>

      <div className="relative w-full max-w-xl animate-pop-in text-center">
        <div className="marquee px-8 py-12 sm:px-14">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.35em] text-popcorn">
            ★ Now showing ★
          </p>
          <h1 className="mt-4 font-display text-5xl font-bold leading-none tracking-tight sm:text-6xl">
            Movie{" "}
            <span className="bg-linear-to-r from-popcorn via-cherry to-sky bg-clip-text text-transparent">
              Memory
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-sm text-lg text-muted">
            Tell us your favorite movie and we&apos;ll roll out a fun fact about it. Fresh
            popcorn every minute.
          </p>

          {error && (
            <p
              role="alert"
              className="mx-auto mt-6 max-w-sm rounded-2xl border border-cherry/40 bg-cherry/15 px-4 py-3 text-sm text-cream"
            >
              🙈 Sign-in didn&apos;t work. Please try again.
            </p>
          )}

          <form action={signInWithGoogle} className="mt-9">
            <button type="submit" className="btn-pop px-7 py-3.5 text-lg">
              <GoogleLogo />
              Sign in with Google
            </button>
          </form>
        </div>

        <ol className="mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 font-display text-sm text-muted">
          {STEPS.map((step, i) => (
            <li key={step.label} className="flex items-center gap-3">
              <span className="rounded-full border border-cream/15 bg-night-800/70 px-3 py-1.5">
                <span aria-hidden="true">{step.emoji}</span> {step.label}
              </span>
              {i < STEPS.length - 1 && (
                <span aria-hidden="true" className="hidden text-popcorn sm:inline">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}

function GoogleLogo() {
  return (
    <span className="flex size-7 items-center justify-center rounded-full bg-white">
      <svg aria-hidden="true" viewBox="0 0 48 48" className="size-4.5">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    </span>
  );
}
