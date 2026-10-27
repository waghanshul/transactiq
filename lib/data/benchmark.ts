// Address engine benchmark on the 150-address test set (S3-02, S3-03, S3-16).
// The rules-only engine is scored live (it is fast and has no network calls).
// The Gemini run is triggered from the Metrics page, only asks about the
// addresses the rules were unsure of, and stores its results in
// benchmark_results so the free-tier quota is spent once.
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { benchmarkResults } from "@/lib/db/schema";
import { analyseAddressLines } from "@/lib/suggest/address";
import { dbCache } from "@/lib/suggest/cache";
import { suggestConfig } from "@/lib/suggest/config";
import { askLlmForAddress } from "@/lib/suggest/llm";
import { addressTestSet } from "@/lib/synth/address-testset";

export const GEMINI_ENGINE = "rules+gemini";

const right = (town: string | undefined, country: string | undefined, t: { town: string; country: string }) =>
  !!town && town.toLowerCase() === t.town.toLowerCase() && country === t.country;

export interface EngineScore {
  engine: string;
  total: number;
  shown: number;
  shownRight: number;
  unsure: number;
  ran: boolean;
  note?: string;
}

export function rulesScore(threshold = suggestConfig.minConfidence): EngineScore & { byStyle: { style: string; total: number; shown: number; right: number }[] } {
  const set = addressTestSet();
  const byStyle = new Map<string, { style: string; total: number; shown: number; right: number }>();
  let shown = 0, shownRight = 0;
  for (const t of set) {
    const a = analyseAddressLines(t.lines);
    const s = byStyle.get(t.style) ?? { style: t.style, total: 0, shown: 0, right: 0 };
    s.total++;
    if (a.confidence >= threshold) {
      shown++; s.shown++;
      if (right(a.town, a.country, t)) { shownRight++; s.right++; }
    }
    byStyle.set(t.style, s);
  }
  return { engine: "Rules only (v1)", total: set.length, shown, shownRight, unsure: set.length - shown, ran: true, byStyle: [...byStyle.values()] };
}

export async function geminiScore(db: DB, threshold = suggestConfig.minConfidence): Promise<EngineScore> {
  const rows = await db.select().from(benchmarkResults).where(eq(benchmarkResults.engine, GEMINI_ENGINE));
  if (!rows.length) {
    return {
      engine: "Rules + Gemini fallback (v2)", total: 150, shown: 0, shownRight: 0, unsure: 0, ran: false,
      note: suggestConfig.geminiEnabled ? "Not run yet." : "Needs a free Gemini API key (GEMINI_API_KEY) in Vercel.",
    };
  }
  const shownRows = rows.filter((r) => (r.confidence ?? 0) >= threshold);
  return {
    engine: "Rules + Gemini fallback (v2)", total: rows.length, shown: shownRows.length,
    shownRight: shownRows.filter((r) => r.correct).length, unsure: rows.length - shownRows.length, ran: true,
  };
}

/** Runs Gemini on the addresses the rules were unsure about and stores the combined result. */
export async function runGeminiBenchmark(db: DB): Promise<{ asked: number; failed: number; message?: string }> {
  const cache = dbCache(db);
  const set = addressTestSet();
  const rows: (typeof benchmarkResults.$inferInsert)[] = [];
  let asked = 0, failed = 0;
  let firstError: string | undefined;
  for (const t of set) {
    const a = analyseAddressLines(t.lines);
    if (a.confidence >= suggestConfig.llmBelow) {
      rows.push({ addressId: t.id, engine: GEMINI_ENGINE, townPred: a.town ?? null, countryPred: a.country ?? null, confidence: a.confidence, correct: right(a.town, a.country, t) });
      continue;
    }
    asked++;
    const llm = await askLlmForAddress(t.lines, cache);
    if (!llm.ok) {
      failed++;
      firstError ??= llm.reason;
      rows.push({ addressId: t.id, engine: GEMINI_ENGINE, townPred: a.town ?? null, countryPred: a.country ?? null, confidence: a.confidence, correct: right(a.town, a.country, t) });
      continue;
    }
    const v = llm.value;
    const agrees = a.town?.toLowerCase() === v.town.toLowerCase() && a.country === v.country;
    const confidence = agrees ? Math.max(a.confidence, Math.min(0.9, v.confidence)) : Math.min(0.8, v.confidence);
    rows.push({ addressId: t.id, engine: GEMINI_ENGINE, townPred: v.town, countryPred: v.country, confidence, correct: right(v.town, v.country, t) });
  }
  if (asked > 0 && failed === asked) return { asked, failed, message: firstError }; // nothing learned: keep the last good run
  await db.delete(benchmarkResults).where(eq(benchmarkResults.engine, GEMINI_ENGINE));
  await db.insert(benchmarkResults).values(rows);
  return { asked, failed, message: firstError };
}
