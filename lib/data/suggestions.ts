// Stores and loads suggestions. The suggestions table keeps the contract
// fields in their own columns; options, cross-check notes and the rules a
// suggestion resolves ride inside the new_value JSON so no migration was needed.
import { asc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { beneficiaries, bicDirectory, clients, corridorRules, payments, suggestions, validationResults } from "@/lib/db/schema";
import type { ParsedTransfer } from "@/lib/iso/parse";
import type { PostalAddress } from "@/lib/iso/types";
import { contextBuilder } from "@/lib/suggest/context";
import type { SuggestContext } from "@/lib/suggest/engine";
import type { RepairField, RepairValue, Suggestion } from "@/lib/suggest/types";

interface Envelope {
  value: RepairValue;
  options?: RepairValue[];
  checks?: string[];
  resolves: string[];
  /** True once the OpenStreetMap / Gemini layer has run. */
  enhanced?: boolean;
}

export interface StoredSuggestion extends Suggestion {
  id: number;
  enhanced: boolean;
}

export async function loadContextBuilder(db: DB): Promise<(id: string) => SuggestContext | undefined> {
  const [pays, cls, bens, bics, cors] = await Promise.all([
    db.select({ id: payments.id, clientId: payments.clientId, beneficiaryId: payments.beneficiaryId, corridor: payments.corridor, receivedAt: payments.receivedAt, parsed: payments.parsed }).from(payments),
    db.select({ id: clients.id, name: clients.name, address: clients.masterAddress, agentBic: clients.agentBic }).from(clients),
    db.select({ id: beneficiaries.id, name: beneficiaries.name, address: beneficiaries.address, agentBic: beneficiaries.agentBic }).from(beneficiaries),
    db.select({ bic: bicDirectory.bic, country: bicDirectory.country, name: bicDirectory.name }).from(bicDirectory),
    db.select({ id: corridorRules.id, creditorCountry: corridorRules.creditorCountry }).from(corridorRules),
  ]);
  return contextBuilder({
    payments: pays.map((p) => ({ ...p, msg: p.parsed as ParsedTransfer })),
    clients: cls.map((c) => ({ ...c, address: c.address as PostalAddress })),
    beneficiaries: bens.map((b) => ({ ...b, address: b.address as PostalAddress })),
    bics,
    corridorCountry: Object.fromEntries(cors.map((c) => [c.id, c.creditorCountry])),
  });
}

export function toRow(s: Suggestion, resultId: number, enhanced = false) {
  const envelope: Envelope = { value: s.newValue, options: s.options, checks: s.checks, resolves: s.resolves, enhanced };
  return {
    resultId, fieldPath: s.fieldPath, oldValue: (s.oldValue ?? null) as object | null, newValue: envelope as unknown as object,
    source: s.source, confidence: s.confidence, reason: s.reason,
  };
}

function fromRow(r: typeof suggestions.$inferSelect): StoredSuggestion {
  const e = r.newValue as unknown as Envelope;
  return {
    id: r.id, fieldPath: r.fieldPath as RepairField, oldValue: (r.oldValue ?? undefined) as RepairValue | undefined,
    newValue: e.value, source: r.source as Suggestion["source"], confidence: r.confidence, reason: r.reason,
    resolves: e.resolves ?? [], options: e.options, checks: e.checks, enhanced: !!e.enhanced,
  };
}

export async function suggestionsFor(db: DB, paymentId: string): Promise<StoredSuggestion[]> {
  const results = await db.select({ id: validationResults.id }).from(validationResults).where(eq(validationResults.paymentId, paymentId));
  if (!results.length) return [];
  const rows = await db.select().from(suggestions)
    .where(inArray(suggestions.resultId, results.map((r) => r.id)))
    .orderBy(asc(suggestions.id));
  return rows.map(fromRow);
}

export async function saveEnhanced(db: DB, id: number, s: Suggestion) {
  const [row] = await db.select({ resultId: suggestions.resultId }).from(suggestions).where(eq(suggestions.id, id));
  if (!row) return;
  const { resultId, ...values } = toRow(s, row.resultId, true);
  await db.update(suggestions).set({ ...values, resultId }).where(eq(suggestions.id, id));
}

/** All stored suggestions with their payment, for the metrics page. */
export async function allSuggestions(db: DB) {
  const rows = await db
    .select({ s: suggestions, paymentId: validationResults.paymentId })
    .from(suggestions)
    .innerJoin(validationResults, eq(suggestions.resultId, validationResults.id));
  return rows.map((r) => ({ paymentId: r.paymentId, ...fromRow(r.s) }));
}
