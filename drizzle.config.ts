import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load .env.local first, then .env.development.local (same order as Next.js)
config({ path: ".env.local" });
config({ path: ".env.development.local" });

export default defineConfig({
  out: "./db/migrations",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
