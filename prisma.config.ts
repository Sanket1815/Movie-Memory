import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 reads connection settings from this file rather than from schema.prisma.
// dotenv is loaded here because the Prisma CLI does not read .env on its own.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
