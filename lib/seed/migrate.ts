// Applies the SQL migrations in /drizzle to DATABASE_URL. Used by the browser
// setup page so the app can be set up without a terminal. Safe to run
// repeatedly: Drizzle records applied migrations and skips them next time.
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { isNeonUrl } from "@/lib/db/client";

export async function runMigrations(url: string): Promise<void> {
  const migrationsFolder = join(process.cwd(), "drizzle");
  if (isNeonUrl(url)) {
    await migrateNeon(drizzleNeon(neon(url)), { migrationsFolder });
    return;
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migratePg(drizzlePg(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
