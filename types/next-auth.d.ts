import type { DefaultSession } from "next-auth";

// Our session callback (lib/auth.ts) always sets user.id, so make it non-optional in types.
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
