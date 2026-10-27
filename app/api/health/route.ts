// Warm-up and health check (S4-10). Open /api/health a minute or two before a
// demo: it wakes the free Neon database (which sleeps after 5 minutes idle) and
// reports what is configured, without revealing any secret.
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { suggestConfig } from "@/lib/suggest/config";

export async function GET() {
  const started = Date.now();
  try {
    const res = await getDb().execute(sql`select (select count(*) from payments)::int as payments, (select count(*) from validation_results)::int as findings`);
    const row = ((res as unknown as { rows?: Record<string, number>[] }).rows ?? (res as unknown as Record<string, number>[]))[0];
    return Response.json({
      ok: true,
      dbMs: Date.now() - started,
      payments: row?.payments ?? 0,
      checksRun: (row?.findings ?? 0) > 0,
      gemini: suggestConfig.geminiEnabled,
      email: Boolean(process.env.RESEND_API_KEY && process.env.NOTE_TO_EMAIL),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "database unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
