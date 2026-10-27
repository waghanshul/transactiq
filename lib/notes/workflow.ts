// Client note workflow: a maker drafts and edits, a DIFFERENT person approves
// and sends. Same rule as payment repairs. Every step goes to audit_log.
import { and, eq } from "drizzle-orm";
import { AuthError, requireRole, type SessionUser } from "@/lib/auth";
import type { DB } from "@/lib/db/client";
import { auditLog, clientNotes } from "@/lib/db/schema";
import { clientProblems } from "@/lib/data/insights";
import { dbCache } from "@/lib/suggest/cache";
import { WorkflowError } from "@/lib/repair/workflow";
import { draftNote, sendNote } from "./client-note";

const audit = (db: DB, actorId: string, action: string, noteId: number, after?: unknown) =>
  db.insert(auditLog).values({ actorId, action, entity: "client_note", entityId: String(noteId), after: (after ?? null) as object | null });

export async function createDraft(db: DB, user: SessionUser | undefined, clientId: string) {
  const maker = requireRole(user, "maker");
  const p = await clientProblems(db, clientId);
  if (!p) throw new WorkflowError("Client not found.");
  if (!p.beneficiaries.length) throw new WorkflowError("This client has no recurring problems to report.");
  const draft = await draftNote({ clientName: p.client.name, totalPayments: p.total, affectedPayments: p.affected, beneficiaries: p.beneficiaries }, dbCache(db));
  const [note] = await db.insert(clientNotes).values({ clientId, body: draft.body }).returning();
  await audit(db, maker.id, "draft_client_note", note.id, { clientId, source: draft.source, note: draft.note ?? null });
  return { note, source: draft.source, message: draft.note };
}

async function loadOpen(db: DB, noteId: number) {
  const [n] = await db.select().from(clientNotes).where(eq(clientNotes.id, noteId));
  if (!n) throw new WorkflowError("Note not found.");
  if (n.approvedBy) throw new WorkflowError("This note is already approved and can't be changed.");
  return n;
}

export async function editDraft(db: DB, user: SessionUser | undefined, noteId: number, body: string) {
  const maker = requireRole(user, "maker");
  await loadOpen(db, noteId);
  const text = body.trim();
  if (text.length < 20) throw new WorkflowError("The note is too short.");
  if (text.length > 5000) throw new WorkflowError("The note is too long.");
  await db.update(clientNotes).set({ body: text }).where(eq(clientNotes.id, noteId));
  await audit(db, maker.id, "edit_client_note", noteId, { length: text.length });
}

export async function approveAndSend(db: DB, user: SessionUser | undefined, noteId: number) {
  const checker = requireRole(user, "checker");
  const n = await loadOpen(db, noteId);
  const authors = await db.select({ actorId: auditLog.actorId }).from(auditLog)
    .where(and(eq(auditLog.entity, "client_note"), eq(auditLog.entityId, String(noteId))));
  if (authors.some((a) => a.actorId === checker.id)) throw new AuthError("You worked on this note, so a different person must approve it.");
  const result = await sendNote("Payments that needed correction: records to update", n.body);
  await db.update(clientNotes).set({ approvedBy: checker.id, sentAt: result.sent ? new Date() : null }).where(eq(clientNotes.id, noteId));
  await audit(db, checker.id, result.sent ? "send_client_note" : "approve_client_note", noteId, { emailed: result.sent, reason: result.reason ?? null });
  return result;
}
