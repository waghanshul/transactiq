"use server";

import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/seed/migrate";
import { seedDatabase, type SeedSummary } from "@/lib/seed/seed";

export interface SetupState {
  ok: boolean;
  message: string;
  summary?: SeedSummary;
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Creates the tables (if needed) and loads or resets the demo data. */
export async function setupDemo(_prev: SetupState | null, formData: FormData): Promise<SetupState> {
  const url = process.env.DATABASE_URL;
  const expected = process.env.RESET_SECRET;
  if (!url) {
    return { ok: false, message: "DATABASE_URL isn't set. In Vercel, open Storage and connect a Neon database, then redeploy." };
  }
  if (!expected) {
    return { ok: false, message: "RESET_SECRET isn't set. Add it in Vercel under Settings > Environment Variables, then redeploy." };
  }
  const given = String(formData.get("secret") ?? "");
  if (!sameSecret(given, expected)) {
    return { ok: false, message: "That secret doesn't match RESET_SECRET. Check it in Vercel's environment variables." };
  }
  try {
    await runMigrations(url);
    const summary = await seedDatabase(getDb());
    return { ok: true, message: "Demo data is ready.", summary };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Setup failed: ${detail}` };
  }
}
