// Scores the stored rule results against the answer key. The answer key is
// read here, after the rules have run, and never by the rules themselves.
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { answerKey, auditLog, payments, repairs, validationResults } from "@/lib/db/schema";
import type { RepairDiff } from "@/lib/repair/workflow";
import { suggestConfig } from "@/lib/suggest/config";
import { scoreSuggestions } from "@/lib/suggest/score";
import { allSuggestions } from "./suggestions";
import { rejectBucket } from "@/lib/rules/engine";
import { evaluate, type PaymentFindings } from "@/lib/rules/evaluate";
import type { Finding } from "@/lib/rules/types";

export async function currentMetrics() {
  const db = getDb();
  const [key, rows, results] = await Promise.all([
    db
      .select({ paymentId: answerKey.paymentId, bucket: answerKey.bucket, variant: answerKey.variant, detectablePreSend: answerKey.detectablePreSend, description: answerKey.description })
      .from(answerKey),
    db.select({ id: payments.id, mode: payments.mode, status: payments.status, rejectReasonCode: payments.rejectReasonCode }).from(payments),
    db
      .select({ paymentId: validationResults.paymentId, bucket: validationResults.bucket, reasonCode: validationResults.reasonCode, ruleId: validationResults.ruleId })
      .from(validationResults)
      .orderBy(asc(validationResults.bucket), asc(validationResults.id)),
  ]);

  const checked = rows.some((r) => r.mode === "prevent" && r.status !== "new");
  const byPayment = new Map<string, typeof results>();
  for (const r of results) byPayment.set(r.paymentId, [...(byPayment.get(r.paymentId) ?? []), r]);

  const findings: PaymentFindings[] = rows.map((p) => {
    const own = byPayment.get(p.id) ?? [];
    return {
      paymentId: p.id,
      mode: p.mode as "prevent" | "repair",
      buckets: own.map((f) => f.bucket),
      rejectBucket: p.mode === "repair"
        ? rejectBucket(p.rejectReasonCode, own.map((f) => ({ bucket: f.bucket, reasonCode: f.reasonCode }) as Finding))
        : undefined,
    };
  });

  const ruleHits = new Map<string, number>();
  for (const r of results) ruleHits.set(r.ruleId, (ruleHits.get(r.ruleId) ?? 0) + 1);

  return { checked, evaluation: evaluate(key, findings), key, ruleHits };
}

/** Sprint 3: how good the suggestions are, and what the repair workflow did. */
export async function repairMetrics() {
  const db = getDb();
  const [key, suggestions, repairRows, sentBack] = await Promise.all([
    db.select({ paymentId: answerKey.paymentId, variant: answerKey.variant, fieldPath: answerKey.fieldPath, autoSuggestable: answerKey.autoSuggestable, expectedFix: answerKey.expectedFix }).from(answerKey),
    allSuggestions(db),
    db.select({ state: repairs.state, diff: repairs.diff, paymentId: repairs.paymentId }).from(repairs),
    db.select({ entityId: auditLog.entityId }).from(auditLog).where(eqAction("send_back")),
  ]);
  const score = scoreSuggestions(key, suggestions, suggestConfig.minConfidence);
  const approved = repairRows.filter((r) => r.state === "approved");
  const bounced = new Set(sentBack.map((s) => s.entityId));
  const changes = repairRows.flatMap((r) => ((r.diff ?? { changes: [] }) as RepairDiff).changes ?? []);
  return {
    score,
    threshold: suggestConfig.minConfidence,
    repairs: {
      open: repairRows.filter((r) => r.state === "draft" || r.state === "submitted").length,
      approved: approved.length,
      firstTimeRight: approved.filter((r) => !bounced.has(r.paymentId)).length,
      sentBack: bounced.size,
    },
    changes: {
      accepted: changes.filter((c) => c.how === "accepted").length,
      edited: changes.filter((c) => c.how === "edited").length,
      manual: changes.filter((c) => c.how === "manual").length,
    },
  };
}

const eqAction = (a: string) => eq(auditLog.action, a);
