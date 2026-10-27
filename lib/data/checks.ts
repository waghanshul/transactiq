// Runs the rule engine over every payment in the database and stores the results.
// Re-running is safe: previous results are replaced, and payments already in a
// later stage of the repair workflow (Sprint 3) are left alone.
import { eq, inArray, sql } from "drizzle-orm";
import type { ParsedTransfer } from "@/lib/iso/parse";
import { checkBatch, type Outcome } from "@/lib/rules/engine";
import { referenceFromRows } from "@/lib/rules/reference";
import type { CheckablePayment } from "@/lib/rules/types";
import type { DB } from "@/lib/db/client";
import { auditLog, bicDirectory, corridorRules, payments, screeningNames, suggestions, validationResults } from "@/lib/db/schema";
import { suggestForPayment } from "@/lib/suggest/engine";
import { loadContextBuilder, toRow } from "./suggestions";

/** Statuses the checker may overwrite. Later workflow states are never touched. */
const RECHECKABLE = ["new", "ready", "flagged", "held", "compliance"];
const CHUNK = 50;

export interface RunSummary {
  checked: number;
  outcomes: Record<Outcome, number>;
  rejectedExplained: number;
  findings: number;
  suggestions: number;
  ms: number;
}

export async function loadReference(db: DB) {
  const [corridors, bics, watchlist] = await Promise.all([
    db.select().from(corridorRules),
    db.select({ bic: bicDirectory.bic, country: bicDirectory.country }).from(bicDirectory),
    db.select({ name: screeningNames.name, aliases: screeningNames.aliases }).from(screeningNames),
  ]);
  return referenceFromRows({ corridors, bics, watchlist });
}

export async function runChecks(db: DB, actorId = "system"): Promise<RunSummary> {
  const started = Date.now();
  const [rows, ref] = await Promise.all([
    db
      .select({
        id: payments.id, msgType: payments.msgType, mode: payments.mode, status: payments.status,
        clientId: payments.clientId, corridor: payments.corridor, receivedAt: payments.receivedAt, parsed: payments.parsed,
      })
      .from(payments),
    loadReference(db),
  ]);

  const toCheckable = (r: (typeof rows)[number]): CheckablePayment => ({
    id: r.id,
    msgType: r.msgType as CheckablePayment["msgType"],
    clientId: r.clientId,
    corridor: r.corridor,
    receivedAt: r.receivedAt,
    msg: r.parsed as ParsedTransfer,
  });

  const prevent = rows.filter((r) => r.mode === "prevent" && RECHECKABLE.includes(r.status));
  const repair = rows.filter((r) => r.mode === "repair" && r.status === "rejected");
  // Duplicate detection looks across the whole outgoing batch, whatever its status.
  const preventResults = checkBatch(rows.filter((r) => r.mode === "prevent").map(toCheckable), ref);
  const repairResults = checkBatch(repair.map(toCheckable), ref);

  const ids = [...prevent, ...repair].map((r) => r.id);
  const findingRows = [...prevent.map((r) => r.id), ...repair.map((r) => r.id)].flatMap((id) => {
    const result = preventResults.get(id) ?? repairResults.get(id)!;
    return result.findings.map((f) => ({
      paymentId: id, ruleId: f.ruleId, bucket: f.bucket, severity: f.severity,
      xpath: f.fieldPath, reasonCode: f.reasonCode, message: f.message,
    }));
  });

  // Replace previous results for the payments being re-checked.
  for (let i = 0; i < ids.length; i += CHUNK) {
    await db.delete(validationResults).where(inArray(validationResults.paymentId, ids.slice(i, i + CHUNK)));
  }
  const inserted: { id: number; paymentId: string; ruleId: string; xpath: string | null }[] = [];
  for (let i = 0; i < findingRows.length; i += CHUNK) {
    inserted.push(...await db.insert(validationResults).values(findingRows.slice(i, i + CHUNK))
      .returning({ id: validationResults.id, paymentId: validationResults.paymentId, ruleId: validationResults.ruleId, xpath: validationResults.xpath }));
  }

  // Suggestions (Sprint 3): rules only, no network calls in the batch run.
  const ctxFor = await loadContextBuilder(db);
  const statusAfter = (r: (typeof rows)[number]) =>
    r.mode === "repair" ? r.status : preventResults.get(r.id)!.outcome === "compliance" ? "compliance" : "flagged";
  const suggestionRows = [...prevent, ...repair].flatMap((r) => {
    const mine = inserted.filter((f) => f.paymentId === r.id);
    if (!mine.length) return [];
    const ctx = ctxFor(r.id);
    if (!ctx) return [];
    const list = suggestForPayment(r.parsed as ParsedTransfer, mine.map((f) => ({ ruleId: f.ruleId, fieldPath: f.xpath ?? "" })), statusAfter(r), ctx);
    return list.map((sg) => toRow(sg, mine.find((f) => sg.resolves.includes(f.ruleId))!.id));
  });
  for (let i = 0; i < suggestionRows.length; i += CHUNK) {
    await db.insert(suggestions).values(suggestionRows.slice(i, i + CHUNK));
  }

  const outcomes: Record<Outcome, number> = { ready: 0, flagged: 0, held: 0, compliance: 0 };
  const byOutcome = new Map<Outcome, string[]>();
  for (const r of prevent) {
    const outcome = preventResults.get(r.id)!.outcome;
    outcomes[outcome]++;
    byOutcome.set(outcome, [...(byOutcome.get(outcome) ?? []), r.id]);
  }
  for (const [outcome, idsFor] of byOutcome) {
    for (let i = 0; i < idsFor.length; i += 200) {
      await db.update(payments).set({ status: outcome }).where(inArray(payments.id, idsFor.slice(i, i + 200)));
    }
  }

  const summary: RunSummary = {
    checked: prevent.length + repair.length,
    outcomes,
    rejectedExplained: repair.length,
    findings: findingRows.length,
    suggestions: suggestionRows.length,
    ms: Date.now() - started,
  };
  await db.insert(auditLog).values({
    actorId, action: "run_checks", entity: "batch", entityId: "all",
    after: summary as unknown as Record<string, unknown>,
  });
  return summary;
}

export async function findingsFor(db: DB, paymentId: string) {
  return db
    .select()
    .from(validationResults)
    .where(eq(validationResults.paymentId, paymentId))
    .orderBy(validationResults.bucket, validationResults.id);
}

export async function checksHaveRun(db: DB): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(payments)
    .where(sql`${payments.mode} = 'prevent' and ${payments.status} <> 'new'`);
  return (row?.n ?? 0) > 0;
}
