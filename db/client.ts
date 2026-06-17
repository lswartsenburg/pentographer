import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

config({ path: ".env.local" });
config({ path: ".env.development.local" });

const sql = postgres(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
