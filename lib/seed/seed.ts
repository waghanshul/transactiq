// Seeds (or resets) the demo database to an exact, repeatable state.
// Keeps anything that should survive a demo reset: user roles, imported real
// reference data (GLEIF BICs, OFAC names), benchmark results and the API cache.
import { sql, type SQL } from "drizzle-orm";
import { parseMessage } from "@/lib/iso/parse";
import { BANKS } from "@/lib/reference/banks";
import { PURPOSE_CODES, REASON_CODES } from "@/lib/reference/codes";
import { CORRIDORS } from "@/lib/reference/corridors";
import { COUNTRIES } from "@/lib/reference/countries";
import { SYNTHETIC_WATCHLIST } from "@/lib/reference/screening";
import { generateDataset } from "@/lib/synth/generate";
import type { DB } from "@/lib/db/client";
import * as s from "@/lib/db/schema";

const CHUNK = 50;

async function insertChunked<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
}

export interface SeedSummary {
  clients: number;
  beneficiaries: number;
  payments: number;
  prevent: number;
  repair: number;
  answerKey: number;
  ms: number;
}

export async function seedDatabase(db: DB, now: Date = new Date()): Promise<SeedSummary> {
  const started = Date.now();
  const ds = generateDataset({ baseDate: now });

  const run = (q: SQL) => db.execute(q);
  await run(sql`TRUNCATE TABLE suggestions, validation_results, repairs, audit_log, answer_key, client_notes,
    payments, beneficiaries, clients, corridor_rules, countries, reason_codes, purpose_codes RESTART IDENTITY CASCADE`);
  await run(sql`DELETE FROM bic_directory WHERE source = 'synthetic'`);
  await run(sql`DELETE FROM screening_names WHERE source = 'synthetic'`);

  // Reference data
  await insertChunked(COUNTRIES, (c) => db.insert(s.countries).values(c));
  await db.insert(s.reasonCodes).values(REASON_CODES);
  await db.insert(s.purposeCodes).values(PURPOSE_CODES);
  await db.insert(s.bicDirectory)
    .values(BANKS.map((b) => ({ bic: b.bic, name: b.name, city: b.city, country: b.country, source: "synthetic" })))
    .onConflictDoNothing();
  await db.insert(s.corridorRules).values(CORRIDORS.map((c) => ({ ...c, maxAmount: c.maxAmount.toFixed(2) })));
  await db.insert(s.screeningNames).values(SYNTHETIC_WATCHLIST.map((w) => ({ ...w, source: "synthetic" })));

  // Clients and beneficiaries
  await db.insert(s.clients).values(ds.clients.map((c) => ({
    id: c.id, name: c.name, shortCode: c.shortCode, country: c.country, channel: c.channel,
    corridors: c.corridors, masterAddress: c.address, account: c.account, agentBic: c.agentBic,
  })));
  await insertChunked(ds.beneficiaries, (rows) => db.insert(s.beneficiaries).values(rows.map((b) => ({
    id: b.id, clientId: b.clientId, name: b.name, country: b.country, address: b.address,
    account: b.account, agentBic: b.agentBic, purposeCode: b.purposeCode,
  }))));

  // Payments
  const minute = 60_000;
  await insertChunked(ds.payments, (rows) => db.insert(s.payments).values(rows.map((p) => ({
    id: p.id, batchId: p.batchId, msgType: p.msgType, mode: p.mode, clientId: p.clientId,
    beneficiaryId: p.beneficiaryId, corridor: p.corridor,
    amount: p.transfer.amount, currency: p.transfer.currency,
    debtorName: p.transfer.debtor.name, creditorName: p.transfer.creditor.name,
    endToEndId: p.transfer.endToEndId, uetr: p.transfer.uetr,
    rawXml: p.xml, parsed: parseMessage(p.xml), rejectXml: p.rejectXml ?? null,
    rejectReasonCode: p.rejectReasonCode ?? null,
    status: p.mode === "repair" ? "rejected" : "new",
    receivedAt: new Date(now.getTime() - p.createdOffsetMin * minute),
    cutoffAt: new Date(now.getTime() + p.cutoffOffsetMin * minute),
  }))));

  await insertChunked(ds.answerKey, (rows) => db.insert(s.answerKey).values(rows.map((a) => ({
    paymentId: a.paymentId, bucket: a.bucket, variant: a.variant, fieldPath: a.fieldPath,
    expectedReasonCode: a.expectedReasonCode, description: a.description, expectedFix: a.expectedFix,
    autoSuggestable: a.autoSuggestable, detectablePreSend: a.detectablePreSend,
    difficulty: a.difficulty, relatedPaymentId: a.relatedPaymentId ?? null,
  }))));

  await db.insert(s.auditLog).values({
    actorId: "system", action: "demo_reset", entity: "database", entityId: "all",
    after: { payments: ds.payments.length, answerKey: ds.answerKey.length },
  });

  return {
    clients: ds.clients.length,
    beneficiaries: ds.beneficiaries.length,
    payments: ds.payments.length,
    prevent: ds.payments.filter((p) => p.mode === "prevent").length,
    repair: ds.payments.filter((p) => p.mode === "repair").length,
    answerKey: ds.answerKey.length,
    ms: Date.now() - started,
  };
}
