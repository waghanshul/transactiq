// Queries for the repair workbench page.
import { asc, desc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { auditLog, clients, corridorRules, payments } from "@/lib/db/schema";
import { findingsFor } from "@/lib/data/checks";
import { saveEnhanced, suggestionsFor, type StoredSuggestion } from "@/lib/data/suggestions";
import { lastRepairFor, logEvent, openRepairFor, previewRepair } from "@/lib/repair/workflow";
import { dbCache } from "@/lib/suggest/cache";
import { enhanceSuggestion } from "@/lib/suggest/enhance";

export async function loadRepairPayment(db: DB, id: string) {
  const [row] = await db
    .select({ payment: payments, clientName: clients.name, corridorLabel: corridorRules.label })
    .from(payments)
    .innerJoin(clients, eq(payments.clientId, clients.id))
    .innerJoin(corridorRules, eq(payments.corridor, corridorRules.id))
    .where(eq(payments.id, id));
  return row;
}

const EDITABLE = new Set(["flagged", "rejected", "in_repair"]);

/**
 * Suggestions for the page. The first time a repair is opened, address
 * suggestions get the OpenStreetMap check (and Gemini when the rules were
 * unsure); the result is stored so it runs once per suggestion.
 */
export async function loadSuggestions(db: DB, paymentId: string, status: string): Promise<StoredSuggestion[]> {
  const list = await suggestionsFor(db, paymentId);
  if (!EDITABLE.has(status)) return list;
  const pending = list.filter((s) => !s.enhanced && s.fieldPath.endsWith("/PstlAdr"));
  if (!pending.length) return list;
  const cache = dbCache(db);
  const enhanced = new Map<number, StoredSuggestion>();
  for (const s of pending) {
    const e = await enhanceSuggestion(s, cache, db);
    await saveEnhanced(db, s.id, e);
    enhanced.set(s.id, { ...e, id: s.id, enhanced: true });
  }
  await logEvent(db, "system", "suggest", paymentId, {
    suggestions: [...enhanced.values()].map((s) => ({ fieldPath: s.fieldPath, source: s.source, confidence: s.confidence })),
  });
  return list.map((s) => enhanced.get(s.id) ?? s);
}

export async function loadRepairState(db: DB, paymentId: string) {
  const open = await openRepairFor(db, paymentId);
  const last = open ?? await lastRepairFor(db, paymentId);
  const preview = open && open.diff.changes.length ? await previewRepair(db, paymentId, open.diff.changes) : undefined;
  return { open, last, preview };
}

export async function loadFindings(db: DB, paymentId: string) {
  return findingsFor(db, paymentId);
}

export async function auditFor(db: DB, paymentId: string) {
  return db.select().from(auditLog).where(eq(auditLog.entityId, paymentId)).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(200);
}

/** Payments waiting for a checker, oldest submission first. */
export async function pendingApprovals(db: DB) {
  return db.select({ id: payments.id }).from(payments).where(eq(payments.status, "pending_check")).orderBy(asc(payments.cutoffAt));
}
