import { db } from "@/lib/db";

export const testDb = db;

/** Wipes all app data. Refuses to run against anything but a *_test database. */
export async function resetDb() {
  const [{ current_database: name }] = await testDb.$queryRaw<{ current_database: string }[]>`
    SELECT current_database()`;
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to wipe database "${name}": tests must use a *_test database.`);
  }
  // Deleting users cascades to Account, Session, Fact and FactLock.
  await testDb.user.deleteMany();
}

export function createUser(email: string, favoriteMovie: string | null = "Alien") {
  return testDb.user.create({ data: { email, name: email.split("@")[0], favoriteMovie } });
}

export function createFact(userId: string, movie: string, content: string, createdAt: Date) {
  return testDb.fact.create({ data: { userId, movie, content, createdAt } });
}

/** Sets a lease for the user that expires `offsetSeconds` from now (DB clock). */
export function setLease(userId: string, offsetSeconds: number) {
  return testDb.$executeRaw`
    INSERT INTO "FactLock" ("userId", "lockedUntil")
    VALUES (${userId}, now() + make_interval(secs => ${offsetSeconds}))`;
}

export const leaseCount = () => testDb.factLock.count();
