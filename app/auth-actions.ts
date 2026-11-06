"use server";

import { signIn, signOut } from "@/lib/auth";

export async function signInWithGoogle() {
  // Everyone lands on /dashboard; the dashboard sends first-time users (no movie yet) on
  // to /onboarding. That keeps the "new vs returning" decision in exactly one place.
  await signIn("google", { redirectTo: "/dashboard" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
