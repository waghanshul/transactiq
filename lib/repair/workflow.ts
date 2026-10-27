// Maker-checker repair workflow (S3-10 to S3-14). Every function here is the
// server-side gate: it checks the user's role, the payment's status and the
// guardrails, and writes to audit_log, whatever the UI did or didn't show.
//
//   flagged / rejected --start--> in_repair --submit--> pending_check --approve--> approved
//                                     ^                        |
//                                     +-------send back--------+
import { and, desc, eq, inArray } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth";
import { AuthError, requireRole } from "@/lib/auth";
import type { DB } from "@/lib/db/client";
import { auditLog, payments, repairs, validationResults } from "@/lib/db/schema";
import { loadReference } from "@/lib/data/checks";
import { applyChanges } from "@/lib/iso/edit";
import { parseMessage, type ParsedTransfer } from "@/lib/iso/parse";
import type { PostalAddress } from "@/lib/iso/types";
import { isAllowedText } from "@/lib/iso/charset";
import { assertCanChange, GuardrailError } from "@/lib/suggest/guardrails";
import { revalidate } from "@/lib/suggest/revalidate";
import type { RepairField, RepairValue } from "@/lib/suggest/types";
import type { Finding } from "@/lib/rules/types";

export interface Change {
  fieldPath: RepairField;
  oldValue?: RepairValue;
  newValue: RepairValue;
  /** accepted = suggestion as shown; edited = suggestion changed by the maker; manual = no suggestion used */
  how: "accepted" | "edited" | "manual";
  suggestionId?: number;
  source?: string;
  confidence?: number;
  by: string;
  at: string;
}

export interface RepairDiff {
  changes: Change[];
  dismissed: number[];
  /** Everyone who changed this repair: none of them may approve it. */
  editors: string[];
  beforeXml?: string;
  afterXml?: string;
  decisions?: { by: string; decision: "approved" | "sent_back"; comment?: string; at: string }[];
}

export class WorkflowError extends Error {}

const STARTABLE = ["flagged", "rejected", "in_repair"];
const OPEN_STATES = ["draft", "submitted"];

async function audit(db: DB, actorId: string, action: string, paymentId: string, before?: unknown, after?: unknown) {
  await db.insert(auditLog).values({
    actorId, action, entity: "payment", entityId: paymentId,
    before: (before ?? null) as object | null, after: (after ?? null) as object | null,
  });
}

async function loadPayment(db: DB, id: string) {
  const [p] = await db.select().from(payments).where(eq(payments.id, id));
  if (!p) throw new WorkflowError(`Payment ${id} not found.`);
  return p;
}

export async function openRepairFor(db: DB, paymentId: string) {
  const [r] = await db.select().from(repairs)
    .where(and(eq(repairs.paymentId, paymentId), inArray(repairs.state, OPEN_STATES)))
    .orderBy(desc(repairs.id)).limit(1);
  return r ? { ...r, diff: (r.diff ?? { changes: [], dismissed: [], editors: [] }) as RepairDiff } : undefined;
}

export async function lastRepairFor(db: DB, paymentId: string) {
  const [r] = await db.select().from(repairs).where(eq(repairs.paymentId, paymentId)).orderBy(desc(repairs.id)).limit(1);
  return r ? { ...r, diff: (r.diff ?? { changes: [], dismissed: [], editors: [] }) as RepairDiff } : undefined;
}

async function findingsOf(db: DB, paymentId: string) {
  return db.select({ ruleId: validationResults.ruleId }).from(validationResults).where(eq(validationResults.paymentId, paymentId));
}

/** Maker starts (or continues) a repair. */
export async function startRepair(db: DB, user: SessionUser | undefined, paymentId: string) {
  const maker = requireRole(user, "maker");
  const p = await loadPayment(db, paymentId);
  assertCanChange(p.status, "Cdtr/Nm", await findingsOf(db, paymentId)); // status-level guardrail
  const open = await openRepairFor(db, paymentId);
  if (open) return open;
  if (!STARTABLE.includes(p.status)) throw new WorkflowError(`A payment that is "${p.status}" can't be repaired.`);
  const diff: RepairDiff = { changes: [], dismissed: [], editors: [] };
  const [r] = await db.insert(repairs).values({ paymentId, makerId: maker.id, state: "draft", diff: diff as unknown as object }).returning();
  await db.update(payments).set({ status: "in_repair" }).where(eq(payments.id, paymentId));
  await audit(db, maker.id, "start_repair", paymentId, { status: p.status }, { status: "in_repair", repairId: r.id });
  return { ...r, diff };
}

const ADDRESS_KEYS = ["StrtNm", "BldgNb", "BldgNm", "Flr", "PstBx", "PstCd", "TwnNm", "DstrctNm", "CtrySubDvsn", "Ctry"] as const;

/** Cleans a value typed or accepted by the maker; refuses anything malformed. */
export function cleanValue(field: RepairField, value: unknown): RepairValue {
  if (field.endsWith("/PstlAdr")) {
    if (!value || typeof value !== "object") throw new WorkflowError("An address must have fields.");
    const v = value as Record<string, unknown>;
    const out: PostalAddress = {};
    for (const k of ADDRESS_KEYS) {
      const s = typeof v[k] === "string" ? (v[k] as string).trim().replace(/\s+/g, " ") : "";
      if (s) {
        if (s.length > 70) throw new WorkflowError(`${k} is longer than 70 characters.`);
        out[k] = s;
      }
    }
    const lines = Array.isArray(v.AdrLine) ? (v.AdrLine as unknown[]).map((l) => String(l).trim().replace(/\s+/g, " ")).filter(Boolean) : [];
    if (lines.some((l) => l.length > 70)) throw new WorkflowError("Each address line can have at most 70 characters.");
    if (lines.length) out.AdrLine = lines;
    if (!out.TwnNm || !out.Ctry) throw new WorkflowError("Town and country are required.");
    out.Ctry = out.Ctry.toUpperCase();
    return out;
  }
  if (typeof value !== "string") throw new WorkflowError("A value is required.");
  const s = value.trim().replace(/\s+/g, " ");
  if (!s) throw new WorkflowError("A value is required.");
  if (s.length > 140) throw new WorkflowError("That value is too long.");
  if (!isAllowedText(s)) throw new WorkflowError("Use Latin letters, digits and basic punctuation only (the CBPR+ character set).");
  if (field.endsWith("BICFI")) return s.toUpperCase();
  return s;
}

/** Maker accepts, edits or types a value for one field. */
export async function setChange(
  db: DB, user: SessionUser | undefined, paymentId: string,
  input: { fieldPath: string; newValue: unknown; how: Change["how"]; suggestionId?: number; source?: string; confidence?: number; oldValue?: RepairValue },
) {
  const maker = requireRole(user, "maker");
  const p = await loadPayment(db, paymentId);
  assertCanChange(p.status, input.fieldPath, await findingsOf(db, paymentId));
  const repair = await openRepairFor(db, paymentId) ?? await startRepair(db, maker, paymentId);
  if (repair.state !== "draft") throw new WorkflowError("This repair is waiting for the checker. It can't be changed now.");
  const field = input.fieldPath as RepairField;
  const newValue = cleanValue(field, input.newValue);
  const change: Change = {
    fieldPath: field, oldValue: input.oldValue, newValue, how: input.how, suggestionId: input.suggestionId,
    source: input.source, confidence: input.confidence, by: maker.id, at: new Date().toISOString(),
  };
  const before = repair.diff.changes.find((c) => c.fieldPath === field);
  const diff: RepairDiff = {
    ...repair.diff,
    changes: [...repair.diff.changes.filter((c) => c.fieldPath !== field), change],
    editors: Array.from(new Set([...repair.diff.editors, maker.id])),
  };
  await db.update(repairs).set({ diff: diff as unknown as object }).where(eq(repairs.id, repair.id));
  const action = input.how === "accepted" ? "accept_suggestion" : input.how === "edited" ? "edit_suggestion" : "manual_edit";
  await audit(db, maker.id, action, paymentId, { fieldPath: field, value: before?.newValue ?? input.oldValue ?? null }, { fieldPath: field, value: newValue, suggestionId: input.suggestionId ?? null });
  return diff;
}

export async function undoChange(db: DB, user: SessionUser | undefined, paymentId: string, fieldPath: string) {
  const maker = requireRole(user, "maker");
  const repair = await openRepairFor(db, paymentId);
  if (!repair || repair.state !== "draft") throw new WorkflowError("Nothing to undo.");
  const removed = repair.diff.changes.find((c) => c.fieldPath === fieldPath);
  const diff = { ...repair.diff, changes: repair.diff.changes.filter((c) => c.fieldPath !== fieldPath) };
  await db.update(repairs).set({ diff: diff as unknown as object }).where(eq(repairs.id, repair.id));
  await audit(db, maker.id, "undo_change", paymentId, { fieldPath, value: removed?.newValue ?? null }, null);
}

export async function dismissSuggestion(db: DB, user: SessionUser | undefined, paymentId: string, suggestionId: number, fieldPath: string) {
  const maker = requireRole(user, "maker");
  const repair = await openRepairFor(db, paymentId) ?? await startRepair(db, maker, paymentId);
  if (repair.state !== "draft") throw new WorkflowError("This repair is waiting for the checker.");
  const diff = { ...repair.diff, dismissed: Array.from(new Set([...repair.diff.dismissed, suggestionId])) };
  await db.update(repairs).set({ diff: diff as unknown as object }).where(eq(repairs.id, repair.id));
  await audit(db, maker.id, "reject_suggestion", paymentId, { suggestionId, fieldPath }, null);
}

export interface Preview {
  afterXml: string;
  findings: Finding[];
  /** Findings that were not on the message before the repair. */
  introduced: Finding[];
}

/** The message as it would be after the repair, re-checked with every rule. */
export async function previewRepair(db: DB, paymentId: string, changes: Change[]): Promise<Preview> {
  const p = await loadPayment(db, paymentId);
  const ref = await loadReference(db);
  const afterXml = applyChanges(p.rawXml, p.msgType, changes);
  const before = await db.select({ ruleId: validationResults.ruleId, xpath: validationResults.xpath }).from(validationResults).where(eq(validationResults.paymentId, paymentId));
  const { findings } = revalidate({ id: p.id, msgType: p.msgType as "pacs.008" | "pain.001", clientId: p.clientId, corridor: p.corridor, receivedAt: p.receivedAt }, afterXml, ref);
  const introduced = findings.filter((f) => !before.some((b) => b.ruleId === f.ruleId && b.xpath === f.fieldPath));
  return { afterXml, findings, introduced };
}

/** Maker submits for approval. Blocked unless the repaired message passes every rule. */
export async function submitRepair(db: DB, user: SessionUser | undefined, paymentId: string) {
  const maker = requireRole(user, "maker");
  const p = await loadPayment(db, paymentId);
  const repair = await openRepairFor(db, paymentId);
  if (!repair || repair.state !== "draft") throw new WorkflowError("There is no draft repair to submit.");
  if (!repair.diff.changes.length) throw new WorkflowError("Make at least one change before submitting.");
  for (const c of repair.diff.changes) assertCanChange(p.status, c.fieldPath, await findingsOf(db, paymentId));
  const preview = await previewRepair(db, paymentId, repair.diff.changes);
  if (preview.findings.length) {
    const what = preview.introduced.length ? "The repair introduces a new problem" : "The repaired message still has a problem";
    throw new WorkflowError(`${what}: ${preview.findings.map((f) => f.message).join(" ")}`);
  }
  const touchesParty = repair.diff.changes.some((c) => /\/(Nm|PstlAdr)$/.test(c.fieldPath));
  const diff: RepairDiff = { ...repair.diff, beforeXml: p.rawXml, afterXml: preview.afterXml };
  await db.update(repairs).set({ state: "submitted", makerId: maker.id, diff: diff as unknown as object, submittedAt: new Date() }).where(eq(repairs.id, repair.id));
  await db.update(payments).set({ status: "pending_check", needsRescreen: p.needsRescreen || touchesParty }).where(eq(payments.id, paymentId));
  await audit(db, maker.id, "submit", paymentId, { status: p.status },
    { status: "pending_check", changes: repair.diff.changes.map((c) => ({ fieldPath: c.fieldPath, how: c.how })), needsRescreen: p.needsRescreen || touchesParty });
}

/** Checker approves or sends back. The checker must not have touched the repair. */
export async function decideRepair(db: DB, user: SessionUser | undefined, paymentId: string, decision: "approve" | "send_back", comment?: string) {
  const checker = requireRole(user, "checker");
  const p = await loadPayment(db, paymentId);
  const repair = await openRepairFor(db, paymentId);
  if (!repair || repair.state !== "submitted" || p.status !== "pending_check") throw new WorkflowError("There is no repair waiting for approval.");
  if (repair.makerId === checker.id || repair.diff.editors.includes(checker.id)) {
    throw new AuthError("Maker-checker: you worked on this repair, so a different person must approve it.");
  }
  const note = comment?.trim();
  const decisions = [...(repair.diff.decisions ?? []), { by: checker.id, decision: decision === "approve" ? "approved" as const : "sent_back" as const, comment: note, at: new Date().toISOString() }];

  if (decision === "send_back") {
    if (!note) throw new WorkflowError("Say why you are sending it back, so the maker knows what to fix.");
    await db.update(repairs).set({ state: "draft", comment: note, checkerId: checker.id, diff: { ...repair.diff, decisions } as unknown as object }).where(eq(repairs.id, repair.id));
    await db.update(payments).set({ status: "in_repair" }).where(eq(payments.id, paymentId));
    await audit(db, checker.id, "send_back", paymentId, { status: "pending_check" }, { status: "in_repair", comment: note });
    return;
  }

  // Approve: check once more against the current rules before changing the payment.
  const preview = await previewRepair(db, paymentId, repair.diff.changes);
  if (preview.findings.length) throw new GuardrailError("The repaired message no longer passes every check. Send it back to the maker.");
  const parsed = parseMessage(preview.afterXml) as ParsedTransfer;
  await db.update(payments).set({
    status: "approved", rawXml: preview.afterXml, parsed: parsed as object,
    debtorName: parsed.debtor.name ?? null, creditorName: parsed.creditor.name ?? null, endToEndId: parsed.endToEndId ?? null,
  }).where(eq(payments.id, paymentId));
  await db.update(repairs).set({ state: "approved", checkerId: checker.id, comment: note ?? null, decidedAt: new Date(), diff: { ...repair.diff, afterXml: preview.afterXml, decisions } as unknown as object }).where(eq(repairs.id, repair.id));
  await audit(db, checker.id, "approve", paymentId, { status: "pending_check" }, { status: "approved", comment: note ?? null });
}

export async function logView(db: DB, user: SessionUser | undefined, paymentId: string) {
  await audit(db, user?.id ?? "anonymous", "view", paymentId);
}

export async function logEvent(db: DB, actorId: string, action: string, paymentId: string, after?: unknown) {
  await audit(db, actorId, action, paymentId, null, after);
}
