"use server";

import { refresh } from "next/cache";
import { AuthError, currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import {
  decideRepair, dismissSuggestion, logEvent, logView, setChange, startRepair, submitRepair, undoChange, WorkflowError,
  type Change,
} from "@/lib/repair/workflow";
import { GuardrailError } from "@/lib/suggest/guardrails";
import type { RepairValue } from "@/lib/suggest/types";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

async function run(fn: () => Promise<unknown>, done?: string): Promise<ActionResult> {
  try {
    await fn();
    refresh();
    return { ok: true, message: done };
  } catch (err) {
    if (err instanceof WorkflowError || err instanceof AuthError || err instanceof GuardrailError) return { ok: false, message: err.message };
    console.error(err);
    return { ok: false, message: "Something went wrong. Nothing was changed." };
  }
}

export async function startAction(paymentId: string): Promise<ActionResult> {
  const db = getDb();
  return run(async () => startRepair(db, await currentUser(db), paymentId));
}

export async function setChangeAction(paymentId: string, input: {
  fieldPath: string; newValue: RepairValue; how: Change["how"]; suggestionId?: number; source?: string; confidence?: number; oldValue?: RepairValue;
}): Promise<ActionResult> {
  const db = getDb();
  return run(async () => setChange(db, await currentUser(db), paymentId, input));
}

export async function undoAction(paymentId: string, fieldPath: string): Promise<ActionResult> {
  const db = getDb();
  return run(async () => undoChange(db, await currentUser(db), paymentId, fieldPath));
}

export async function dismissAction(paymentId: string, suggestionId: number, fieldPath: string): Promise<ActionResult> {
  const db = getDb();
  return run(async () => dismissSuggestion(db, await currentUser(db), paymentId, suggestionId, fieldPath));
}

export async function submitAction(paymentId: string): Promise<ActionResult> {
  const db = getDb();
  return run(async () => submitRepair(db, await currentUser(db), paymentId), "Submitted for approval.");
}

export async function decideAction(paymentId: string, decision: "approve" | "send_back", comment: string): Promise<ActionResult> {
  const db = getDb();
  return run(async () => decideRepair(db, await currentUser(db), paymentId, decision, comment),
    decision === "approve" ? "Approved." : "Sent back to the maker.");
}

export async function viewAction(paymentId: string): Promise<void> {
  const db = getDb();
  try { await logView(db, await currentUser(db), paymentId); } catch { /* audit of a view must never break the page */ }
}

export async function clientMessageAction(paymentId: string): Promise<ActionResult> {
  const db = getDb();
  return run(async () => {
    const user = await currentUser(db);
    if (!user || user.role !== "maker") throw new AuthError("Only a maker can contact the client.");
    await logEvent(db, user.id, "draft_client_message", paymentId);
  }, "Noted in the audit trail.");
}
