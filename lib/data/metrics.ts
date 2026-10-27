// Scores the stored rule results against the answer key. The answer key is
// read here, after the rules have run, and never by the rules themselves.
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { answerKey, payments, validationResults } from "@/lib/db/schema";
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
