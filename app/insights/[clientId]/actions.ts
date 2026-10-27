"use server";

import { refresh } from "next/cache";
import { AuthError, currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { approveAndSend, createDraft, editDraft } from "@/lib/notes/workflow";
import { WorkflowError } from "@/lib/repair/workflow";

export interface NoteResult { ok: boolean; message?: string }

async function run(fn: () => Promise<string | undefined>): Promise<NoteResult> {
  try {
    const message = await fn();
    refresh();
    return { ok: true, message };
  } catch (err) {
    if (err instanceof WorkflowError || err instanceof AuthError) return { ok: false, message: err.message };
    console.error(err);
    return { ok: false, message: "Something went wrong. Nothing was changed." };
  }
}

export async function draftAction(clientId: string) {
  const db = getDb();
  return run(async () => {
    const r = await createDraft(db, await currentUser(db), clientId);
    return r.source === "llm" ? "Drafted with Gemini from anonymised facts. Read it before saving." : r.message ?? "Drafted from the template.";
  });
}

export async function saveAction(noteId: number, body: string) {
  const db = getDb();
  return run(async () => { await editDraft(db, await currentUser(db), noteId, body); return "Saved."; });
}

export async function approveAction(noteId: number) {
  const db = getDb();
  return run(async () => {
    const r = await approveAndSend(db, await currentUser(db), noteId);
    return r.sent ? "Approved and emailed to the demo inbox." : `Approved. ${r.reason}`;
  });
}
