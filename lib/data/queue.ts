// Read queries for the Queue page: what needs a person's attention, soonest
// cut-off first, with the problems found on each payment.
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { clients, payments, validationResults } from "@/lib/db/schema";

export type QueueTab = "prevent" | "repair" | "approval";

const ATTENTION: Record<QueueTab, string[]> = {
  prevent: ["flagged", "in_repair", "held", "compliance"],
  repair: ["rejected", "in_repair"],
  approval: ["pending_check"],
};

export async function queueItems(tab: QueueTab, bucket?: number) {
  const db = getDb();
  const rows = await db
    .select({
      id: payments.id,
      msgType: payments.msgType,
      status: payments.status,
      corridor: payments.corridor,
      clientName: clients.name,
      creditorName: payments.creditorName,
      amount: payments.amount,
      currency: payments.currency,
      rejectReasonCode: payments.rejectReasonCode,
      cutoffAt: payments.cutoffAt,
    })
    .from(payments)
    .innerJoin(clients, eq(payments.clientId, clients.id))
    .where(tab === "approval"
      ? inArray(payments.status, ATTENTION.approval)
      : and(eq(payments.mode, tab), inArray(payments.status, ATTENTION[tab])))
    .orderBy(asc(payments.cutoffAt), asc(payments.id));

  const findings = rows.length
    ? await db
        .select({ paymentId: validationResults.paymentId, bucket: validationResults.bucket, message: validationResults.message })
        .from(validationResults)
        .where(inArray(validationResults.paymentId, rows.map((r) => r.id)))
        .orderBy(asc(validationResults.bucket), asc(validationResults.id))
    : [];

  const byPayment = new Map<string, { buckets: number[]; first?: string; count: number }>();
  for (const f of findings) {
    const entry = byPayment.get(f.paymentId) ?? { buckets: [], count: 0 };
    if (!entry.buckets.includes(f.bucket)) entry.buckets.push(f.bucket);
    entry.first ??= f.message;
    entry.count++;
    byPayment.set(f.paymentId, entry);
  }

  const items = rows.map((r) => ({ ...r, ...(byPayment.get(r.id) ?? { buckets: [] as number[], count: 0, first: undefined }) }));
  return bucket ? items.filter((i) => i.buckets.includes(bucket)) : items;
}

export async function statusCounts() {
  const db = getDb();
  return db
    .select({ mode: payments.mode, status: payments.status, n: count() })
    .from(payments)
    .groupBy(payments.mode, payments.status);
}
