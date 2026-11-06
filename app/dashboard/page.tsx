import Image from "next/image";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/auth-actions";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { displayName, initials } from "@/lib/display";
import { FactCard } from "./FactCard";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  // Read the movie from the DB (not the session) so it's always the current value.
  const record = await db.user.findUnique({
    where: { id: user.id },
    select: { favoriteMovie: true },
  });
  // No movie yet = first-time user. This is the only "new vs returning" check in the app.
  if (!record?.favoriteMovie) redirect("/onboarding");

  const name = displayName(user);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:py-14">
      <header className="panel flex animate-pop-in flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          {/* Gradient ring around the avatar (or the initials fallback). */}
          <div className="shrink-0 rounded-full bg-linear-to-br from-popcorn via-cherry to-sky p-[3px]">
            {user.image ? (
              <Image
                src={user.image}
                alt={`${name}'s profile photo`}
                width={64}
                height={64}
                className="size-16 rounded-full border-2 border-night-900"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex size-16 items-center justify-center rounded-full border-2 border-night-900 bg-night-700 font-display text-xl font-bold text-popcorn"
              >
                {initials(name)}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm text-muted">
              Welcome back <span aria-hidden="true">👋</span>
            </p>
            <h1 className="truncate font-display text-2xl font-bold">{name}</h1>
            {user.email && <p className="truncate text-sm text-muted">{user.email}</p>}
          </div>
        </div>

        <form action={signOutAction}>
          <button type="submit" className="btn-ghost px-4 py-2 text-sm">
            Log out <span aria-hidden="true">🚪</span>
          </button>
        </form>
      </header>

      <section
        aria-labelledby="movie-heading"
        className="ticket mt-8 animate-pop-in px-10 py-6 [animation-delay:80ms] sm:px-14"
      >
        <div className="flex items-center gap-5">
          <span aria-hidden="true" className="text-5xl drop-shadow-[0_4px_0_rgb(0_0_0/0.2)]">
            🎬
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="movie-heading"
              className="font-display text-xs font-bold uppercase tracking-[0.18em] sm:tracking-[0.3em] text-night-950/70"
            >
              Your favorite movie
            </h2>
            <p className="mt-1 break-words font-display text-3xl font-bold leading-tight">
              {record.favoriteMovie}
            </p>
          </div>
          <span
            aria-hidden="true"
            className="hidden rotate-6 rounded-lg border-2 border-night-950/70 px-2 py-1 font-display text-xs font-bold uppercase tracking-widest text-night-950/70 sm:block"
          >
            Admit one
          </span>
        </div>
      </section>

      <FactCard />
    </main>
  );
}
