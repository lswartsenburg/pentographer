import { config } from "dotenv";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as pgSchema from "./schema";

config({ path: ".env.local" });
config({ path: ".env.development.local" });

// Both drivers expose the same query API and the SQLite schema produces
// identical TypeScript types to the PG schema (timestamp_ms → Date, json → T, etc.)
export type AppDatabase = PostgresJsDatabase<typeof pgSchema>;

let _db: AppDatabase | null = null;

export function getDb(): AppDatabase {
  if (_db) return _db;

  const url = process.env.DATABASE_URL ?? "";

  if (url.startsWith("file:")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/better-sqlite3");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const schema = require("./schema.sqlite");
    const file = url.replace(/^file:/, "");
    const client = new Database(file);
    client.pragma("journal_mode = WAL");
    client.pragma("foreign_keys = ON");
    _db = drizzle(client, { schema }) as unknown as AppDatabase;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const postgres = require("postgres");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/postgres-js");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const schema = require("./schema");
    _db = drizzle(postgres(url), { schema });
  }

  return _db!;
}

export const db = getDb();
