// Final metrics (S4-03, S4-05): acceptance, time to repair against the manual
// baseline, the usage funnel, and guardrail counters that must stay at zero.
// The answer key is read only to check approved repairs after the fact.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { DEMO_USERS } from "@/lib/auth";
import type { DB } from "@/lib/db/client";
import { answerKey, auditLog, payments, repairs } from "@/lib/db/schema";
import type { RepairDiff } from "@/lib/repair/workflow";
import { scoreSuggestions } from "@/lib/suggest/score";

const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Minutes per repair timed by hand in Sprint 1 (docs/manual-baseline.csv, minutes_to_fix column). */
export async function manualBaseline(): Promise<{ median?: number; timed: number; total: number }> {
  try {
    const csv = await readFile(path.join(process.cwd(), "docs", "manual-baseline.csv"), "utf8");
    const rows = csv.trim().split("\n").slice(1);
    const minutes = rows.map((r) => Number(r.split(",").at(-2))).filter((n) => Number.isFinite(n) && n > 0);
    return { median: median(minutes), timed: minutes.length, total: rows.length };
  } catch {
    return { timed: 0, total: 0 };
  }
}

const MAKERS = new Set(DEMO_USERS.filter((u) => u.role === "maker").map((u) => u.id));
const PROTECTED = /(Acct|IBAN|Amt|Ccy|Amount)/;

export async function finalMetrics(db: DB) {
  const [events, reps, key, baseline] = await Promise.all([
    db.select({ actorId: auditLog.actorId, action: auditLog.action, entityId: auditLog.entityId, after: auditLog.after, at: auditLog.at })
      .from(auditLog).where(eq(auditLog.entity, "payment")),
    db.select().from(repairs),
    db.select({ paymentId: answerKey.paymentId, variant: answerKey.variant, fieldPath: answerKey.fieldPath, autoSuggestable: answerKey.autoSuggestable, expectedFix: answerKey.expectedFix }).from(answerKey),
    manualBaseline(),
  ]);

  // Acceptance of suggestions (S4-03) and the usage funnel (S4-05).
  const count = (a: string) => events.filter((e) => e.action === a).length;
  const accepted = count("accept_suggestion"), edited = count("edit_suggestion"), dismissed = count("reject_suggestion"), manual = count("manual_edit");
  const acted = accepted + edited + dismissed;
  const opened = new Set(events.filter((e) => e.action === "view" && MAKERS.has(e.actorId)).map((e) => e.entityId));
  const shown = new Set(events.filter((e) => e.action === "suggest").map((e) => e.entityId));
  const funnel = [
    { event: "repair_opened", label: "Repairs opened by a maker", n: opened.size },
    { event: "suggestion_shown", label: "Suggestions checked and shown", n: shown.size },
    { event: "suggestion_accepted", label: "Accepted as shown", n: accepted },
    { event: "suggestion_edited", label: "Edited before use", n: edited },
    { event: "repair_approved", label: "Repairs approved by a checker", n: count("approve") },
  ];

  // Time to repair: from the maker's first action to submit, and to approval.
  const byPayment = new Map<string, typeof events>();
  for (const e of events) byPayment.set(e.entityId, [...(byPayment.get(e.entityId) ?? []), e]);
  const makerMinutes: number[] = [], endToEndMinutes: number[] = [];
  for (const list of byPayment.values()) {
    const start = list.filter((e) => e.action === "start_repair").map((e) => e.at.getTime()).sort()[0];
    const submit = list.filter((e) => e.action === "submit").map((e) => e.at.getTime()).sort()[0];
    const approve = list.filter((e) => e.action === "approve").map((e) => e.at.getTime()).sort()[0];
    const firstView = list.filter((e) => e.action === "view" && MAKERS.has(e.actorId)).map((e) => e.at.getTime()).sort()[0] ?? start;
    if (start && submit) makerMinutes.push((submit - Math.min(firstView ?? start, start)) / 60_000);
    if (start && approve) endToEndMinutes.push((approve - Math.min(firstView ?? start, start)) / 60_000);
  }

  // Guardrails: each must be zero.
  const approvedReps = reps.filter((r) => r.state === "approved");
  const approvedChanges = approvedReps.flatMap((r) => ((r.diff ?? {}) as RepairDiff).changes?.map((c) => ({ paymentId: r.paymentId, fieldPath: c.fieldPath, newValue: c.newValue, confidence: 1 })) ?? []);
  const wrong = scoreSuggestions(key, approvedChanges, 0).wrong;
  const selfApproved = approvedReps.filter((r) => r.checkerId && (r.checkerId === r.makerId || ((r.diff ?? {}) as RepairDiff).editors?.includes(r.checkerId))).length;
  const partyIds = approvedReps.filter((r) => ((r.diff ?? {}) as RepairDiff).changes?.some((c) => /\/(Nm|PstlAdr)$/.test(c.fieldPath))).map((r) => r.paymentId);
  const flaggedRows = partyIds.length ? await db.select({ id: payments.id, needsRescreen: payments.needsRescreen }).from(payments).where(inArray(payments.id, partyIds)) : [];
  const approvedIds = new Set(approvedReps.map((r) => r.paymentId));
  const statusRows = await db.select({ id: payments.id, status: payments.status }).from(payments).where(inArray(payments.status, ["approved", "released_sim"]));
  const protectedEdits = events.filter((e) => /suggestion|manual_edit/.test(e.action) && PROTECTED.test(String((e.after as { fieldPath?: string } | null)?.fieldPath ?? ""))).length;

  return {
    acceptance: { accepted, edited, dismissed, manual, rate: acted ? accepted / acted : undefined },
    funnel,
    time: { makerMedian: median(makerMinutes), endToEndMedian: median(endToEndMinutes), repairs: makerMinutes.length, baseline },
    guardrails: [
      { label: "Wrong repairs approved (checked against the answer key)", n: wrong.length, detail: wrong.map((w) => w.paymentId).join(", ") },
      { label: "Payments approved without a checker", n: statusRows.filter((r) => !approvedIds.has(r.id)).length },
      { label: "Repairs approved by their own maker", n: selfApproved },
      { label: "Name or address changes not flagged for re-screening", n: flaggedRows.filter((r) => !r.needsRescreen).length },
      { label: "Edits to accounts, amounts or currencies", n: protectedEdits },
      { label: "Payments released automatically", n: statusRows.filter((r) => r.status === "released_sim").length },
    ],
  };
}
