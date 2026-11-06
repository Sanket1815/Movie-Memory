import "server-only";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

// AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are read from the environment by
// Auth.js automatically (validated at startup in lib/env.ts).
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  // Database sessions: the cookie holds only a random session token; the session itself
  // lives in the Session table. Logging out deletes the row, so the session is revoked
  // server-side immediately (a JWT would stay valid until it expires).
  session: { strategy: "database" },
  providers: [Google],
  // Send users back to our landing page (not Auth.js's built-in page) on errors.
  pages: { signIn: "/", error: "/" },
  callbacks: {
    // With database sessions, `user` is the row from our User table. Auth.js doesn't put
    // the id on the session by default, and every user-scoped query needs it.
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

/** The signed-in user, or null. Use in pages that redirect when logged out. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return null;
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    image: user.image ?? null,
  };
}

/**
 * The signed-in user, or throws AppError("UNAUTHENTICATED"). Use in route handlers and
 * server actions. This is the ONLY place a user id should come from: never from query
 * strings, request bodies or headers, so a caller can't act as someone else.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  return user;
}
