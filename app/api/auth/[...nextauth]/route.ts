// Auth.js endpoints: /api/auth/signin, /api/auth/callback/google, /api/auth/signout, etc.
import { handlers } from "@/lib/auth";

export const runtime = "nodejs"; // Prisma adapter needs Node.js, not Edge.
export const { GET, POST } = handlers;
