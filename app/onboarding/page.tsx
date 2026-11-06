import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { displayName } from "@/lib/display";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const record = await db.user.findUnique({
    where: { id: user.id },
    select: { favoriteMovie: true },
  });
  // Onboarding is first-time only: anyone who already has a movie goes to the dashboard.
  if (record?.favoriteMovie) redirect("/dashboard");

  const firstName = displayName(user).split(" ")[0];

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg animate-pop-in">
        <div className="ticket px-10 pb-8 pt-7 sm:px-14">
          <div className="flex items-center justify-between font-display text-xs font-bold uppercase tracking-[0.3em] text-night-950/70">
            <span>Admit one</span>
            <span aria-hidden="true">No. 0001</span>
          </div>
          <div aria-hidden="true" className="my-5 border-t-2 border-dashed border-night-950/30" />

          <h1 className="font-display text-4xl font-bold leading-tight">
            Welcome, {firstName}! <span aria-hidden="true">🎉</span>
          </h1>
          <p className="mt-2 text-night-950/80">
            Every great memory starts with a great movie. Which one is yours?
          </p>

          <OnboardingForm />
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          You can only pick one, so make it count. <span aria-hidden="true">🍿</span>
        </p>
      </div>
    </main>
  );
}
