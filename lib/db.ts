import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

export function createPrismaClient(connectionString: string): PrismaClient {
  // Prisma 7 talks to Postgres through a driver adapter (here node-postgres).
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Next.js dev mode re-evaluates modules on every hot reload. Without caching the client on
// globalThis, each reload would open a new connection pool until Postgres runs out.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient(getEnv().DATABASE_URL);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
