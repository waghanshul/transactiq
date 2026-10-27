// Insights (S4-01): where errors come from, so they can be fixed at source.
// Built from stored findings and payment statuses only; never the answer key.
import { asc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { clientNotes, clients, corridorRules, payments, validationResults } from "@/lib/db/schema";
import { NEEDS_CLIENT } from "@/lib/repair/client-message";

export interface Group {
  key: string;
  label: string;
  sub?: string;
  payments: number;
  withProblems: number;
  topBucket?: number;
  buckets: Map<number, number>;
}

const FIXED = new Set(["approved", "released_sim"]);
/** Problems a client fixes in its own vendor or beneficiary records. */
const RECORD_BUCKETS = new Set([1, 2, 3, 4, 5, 6]);

export async function loadInsights(db: DB) {
  const [rows, findings, cls, cors] = await Promise.all([
    db.select({ id: payments.id, mode: payments.mode, status: payments.status, clientId: payments.clientId, corridor: payments.corridor }).from(payments),
    db.select({ paymentId: validationResults.paymentId, bucket: validationResults.bucket, ruleId: validationResults.ruleId }).from(validationResults),
    db.select({ id: clients.id, name: clients.name, channel: clients.channel }).from(clients).orderBy(asc(clients.name)),
    db.select({ id: corridorRules.id, label: corridorRules.label }).from(corridorRules),
  ]);
  const checked = rows.some((r) => r.mode === "prevent" && r.status !== "new");
  const byPayment = new Map<string, typeof findings>();
  for (const f of findings) byPayment.set(f.paymentId, [...(byPayment.get(f.paymentId) ?? []), f]);
  const clientOf = new Map(cls.map((c) => [c.id, c]));

  const group = (keyOf: (r: (typeof rows)[number]) => string, labelOf: (k: string) => { label: string; sub?: string }) => {
    const m = new Map<string, Group>();
    for (const r of rows) {
      const k = keyOf(r);
      const g = m.get(k) ?? { key: k, ...labelOf(k), payments: 0, withProblems: 0, buckets: new Map() };
      g.payments++;
      const own = byPayment.get(r.id) ?? [];
      if (own.length) g.withProblems++;
      for (const b of new Set(own.map((f) => f.bucket))) g.buckets.set(b, (g.buckets.get(b) ?? 0) + 1);
      m.set(k, g);
    }
    for (const g of m.values()) g.topBucket = [...g.buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return [...m.values()].sort((a, b) => b.withProblems / b.payments - a.withProblems / a.payments);
  };

  const buckets = new Map<number, { prevent: number; repair: number }>();
  for (const r of rows) {
    for (const b of new Set((byPayment.get(r.id) ?? []).map((f) => f.bucket))) {
      const e = buckets.get(b) ?? { prevent: 0, repair: 0 };
      e[r.mode as "prevent" | "repair"]++;
      buckets.set(b, e);
    }
  }

  // Outgoing batch, before vs with the tool.
  const prevent = rows.filter((r) => r.mode === "prevent");
  const hasProblem = (id: string) => (byPayment.get(id) ?? []).length > 0;
  const needsClient = (id: string) => (byPayment.get(id) ?? []).some((f) => NEEDS_CLIENT.has(f.ruleId) || f.ruleId.startsWith("AMT-"));
  const stp = {
    total: prevent.length,
    clean: prevent.filter((r) => !hasProblem(r.id)).length,
    fixedBeforeSending: prevent.filter((r) => FIXED.has(r.status)).length,
    inProgress: prevent.filter((r) => ["in_repair", "pending_check"].includes(r.status)).length,
    toFix: prevent.filter((r) => r.status === "flagged" && hasProblem(r.id) && !needsClient(r.id)).length,
    needsClientOrDesk: prevent.filter((r) => r.status === "flagged" && needsClient(r.id)).length,
    held: prevent.filter((r) => r.status === "held").length,
    compliance: prevent.filter((r) => r.status === "compliance").length,
  };

  return {
    checked,
    stp,
    buckets: [...buckets.entries()].map(([bucket, n]) => ({ bucket, ...n, total: n.prevent + n.repair })).sort((a, b) => b.total - a.total),
    byClient: group((r) => r.clientId, (k) => ({ label: clientOf.get(k)?.name ?? k, sub: clientOf.get(k)?.channel })),
    byCorridor: group((r) => r.corridor, (k) => ({ label: cors.find((c) => c.id === k)?.label ?? k })),
    byChannel: group((r) => clientOf.get(r.clientId)?.channel ?? "unknown", (k) => ({ label: k })),
  };
}

/** One client's repeat problems, grouped by beneficiary, for the feedback note. */
export async function clientProblems(db: DB, clientId: string) {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return undefined;
  const rows = await db
    .select({ id: payments.id, creditorName: payments.creditorName, beneficiaryId: payments.beneficiaryId, bucket: validationResults.bucket, ruleId: validationResults.ruleId, message: validationResults.message })
    .from(payments)
    .innerJoin(validationResults, eq(validationResults.paymentId, payments.id))
    .where(eq(payments.clientId, clientId));
  const total = (await db.select({ id: payments.id }).from(payments).where(eq(payments.clientId, clientId))).length;
  const byBen = new Map<string, { name: string; payments: Set<string>; buckets: Map<number, number>; example: string }>();
  for (const r of rows) {
    if (!RECORD_BUCKETS.has(r.bucket)) continue; // duplicates, limits and screening aren't fixed in the client's records
    const key = r.beneficiaryId ?? r.creditorName ?? "unknown";
    const e = byBen.get(key) ?? { name: r.creditorName || "Unnamed beneficiary", payments: new Set(), buckets: new Map(), example: r.message };
    e.payments.add(r.id);
    e.buckets.set(r.bucket, (e.buckets.get(r.bucket) ?? 0) + 1);
    byBen.set(key, e);
  }
  const beneficiaries = [...byBen.values()]
    .map((b) => ({ name: b.name, payments: b.payments.size, buckets: [...b.buckets.keys()], example: b.example }))
    .sort((a, b) => b.payments - a.payments);
  const notes = await db.select().from(clientNotes).where(eq(clientNotes.clientId, clientId)).orderBy(asc(clientNotes.id));
  return { client, total, affected: new Set(rows.filter((r) => RECORD_BUCKETS.has(r.bucket)).map((r) => r.id)).size, beneficiaries, notes };
}
