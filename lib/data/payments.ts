// Read queries for the payments pages. Server-only: runs inside Server Components.
import { and, asc, count, eq, gte, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { clients, corridorRules, payments } from "@/lib/db/schema";

export const PAGE_SIZE = 50;

export interface PaymentFilters {
  mode?: string;
  corridor?: string;
  client?: string;
  status?: string;
  msgType?: string;
  q?: string;
  page?: number;
}

function whereFor(f: PaymentFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.mode) conds.push(eq(payments.mode, f.mode));
  if (f.corridor) conds.push(eq(payments.corridor, f.corridor));
  if (f.client) conds.push(eq(payments.clientId, f.client));
  if (f.status) conds.push(eq(payments.status, f.status));
  if (f.msgType) conds.push(eq(payments.msgType, f.msgType));
  if (f.q) {
    const like = `%${f.q.trim()}%`;
    conds.push(or(ilike(payments.id, like), ilike(payments.endToEndId, like), ilike(payments.creditorName, like), ilike(payments.debtorName, like))!);
  }
  return conds.length ? and(...conds) : undefined;
}

export async function listPayments(f: PaymentFilters) {
  const db = getDb();
  const where = whereFor(f);
  const page = Math.max(1, f.page ?? 1);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: payments.id,
        msgType: payments.msgType,
        mode: payments.mode,
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
      .where(where)
      .orderBy(asc(payments.cutoffAt), asc(payments.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(payments).where(where),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function filterOptions() {
  const db = getDb();
  const [clientRows, corridorRows, statusRows] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
    db.select({ id: corridorRules.id, label: corridorRules.label }).from(corridorRules).orderBy(asc(corridorRules.id)),
    db.selectDistinct({ status: payments.status }).from(payments).orderBy(asc(payments.status)),
  ]);
  return { clients: clientRows, corridors: corridorRows, statuses: statusRows.map((r) => r.status) };
}

export async function getPayment(id: string) {
  const db = getDb();
  const [row] = await db
    .select({ payment: payments, clientName: clients.name, corridorLabel: corridorRules.label })
    .from(payments)
    .innerJoin(clients, eq(payments.clientId, clients.id))
    .innerJoin(corridorRules, eq(payments.corridor, corridorRules.id))
    .where(eq(payments.id, id))
    .limit(1);
  return row;
}

export async function overview(now: Date) {
  const db = getDb();
  const [byMode, [next]] = await Promise.all([
    db.select({ mode: payments.mode, status: payments.status, n: count() }).from(payments).groupBy(payments.mode, payments.status),
    db
      .select({ id: payments.id, cutoffAt: payments.cutoffAt })
      .from(payments)
      .where(gte(payments.cutoffAt, now))
      .orderBy(asc(payments.cutoffAt))
      .limit(1),
  ]);
  return { byMode, next };
}
