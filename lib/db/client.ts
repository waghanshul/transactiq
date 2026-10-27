// Database client. Uses Neon's HTTP driver for Neon URLs (fast on Vercel
// serverless, no connection pool to manage) and node-postgres for any other
// Postgres URL, such as a local database during development or tests.
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Both drivers expose the same query-builder API; the app code is typed
// against one of them for simplicity.
export type DB = NodePgDatabase<typeof schema>;

let cached: DB | undefined;

export function isNeonUrl(url: string): boolean {
  return /\.neon\.tech|\.neon\.build/.test(url);
}

export function createDb(url: string): DB {
  if (isNeonUrl(url)) {
    return drizzleNeon(neon(url), { schema }) as unknown as DB;
  }
  return drizzlePg(new Pool({ connectionString: url, max: 5 }), { schema });
}

/** Lazily created so builds and tests that never touch the DB don't need DATABASE_URL. */
export function getDb(): DB {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.");
    cached = createDb(url);
  }
  return cached;
}

export { schema };
