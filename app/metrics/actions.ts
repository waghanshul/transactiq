"use server";

import { refresh } from "next/cache";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { runGeminiBenchmark } from "@/lib/data/benchmark";

export async function runGeminiAction(): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const user = await currentUser(db);
  if (!user || user.role === "viewer") return { ok: false, message: "Sign in as a maker or checker to run the benchmark." };
  const r = await runGeminiBenchmark(db);
  refresh();
  if (r.failed === r.asked && r.asked > 0) return { ok: false, message: r.message ?? "Gemini could not be reached." };
  return { ok: true, message: `Asked Gemini about ${r.asked} addresses the rules were unsure of${r.failed ? ` (${r.failed} failed: ${r.message})` : ""}.` };
}
