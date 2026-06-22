import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.sqlite.ts",
  out: "./db/migrations/sqlite",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL?.replace(/^file:/, "") ?? "local.db",
  },
});
