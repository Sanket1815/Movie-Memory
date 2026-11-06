"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { movieSchema } from "@/lib/validation";

export type OnboardingState = {
  error?: string;
  /** Echoed back so the input keeps what the user typed after a failed submit. */
  value?: string;
};

export async function saveFavoriteMovie(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  // Server actions are public POST endpoints, so re-check auth here even though the
  // page already did. A signed-out caller is sent to sign in rather than shown an error.
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const raw = formData.get("movie");
  const input = typeof raw === "string" ? raw : "";

  const parsed = movieSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid movie title.", value: input };
  }

  try {
    // Scoped to the session user's id only; nothing from the form decides whose row changes.
    await db.user.update({
      where: { id: user.id },
      data: { favoriteMovie: parsed.data },
    });
  } catch (err) {
    console.error("saveFavoriteMovie: failed to save movie", { userId: user.id, err });
    return { error: "We couldn't save your movie. Please try again.", value: input };
  }

  // Outside the try: redirect() works by throwing, and must not be caught above.
  redirect("/dashboard");
}
