"use client";

import { useState, useTransition } from "react";
import { approveAction, draftAction, saveAction, type NoteResult } from "./actions";

export function DraftButton({ clientId, label }: { clientId: string; label: string }) {
  const [r, setR] = useState<NoteResult>();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending} onClick={() => start(async () => setR(await draftAction(clientId)))}
        className="h-10 rounded-md bg-accent px-5 font-semibold text-surface disabled:opacity-60">
        {pending ? "Drafting…" : label}
      </button>
      <span aria-live="polite" className={`text-sm ${r && !r.ok ? "text-rejected" : "text-muted"}`}>{r?.message}</span>
    </div>
  );
}

export function NoteEditor({ noteId, body, canEdit, canApprove }: { noteId: number; body: string; canEdit: boolean; canApprove: boolean }) {
  const [text, setText] = useState(body);
  const [r, setR] = useState<NoteResult>();
  const [pending, start] = useTransition();
  const dirty = text !== body;
  return (
    <div className="flex flex-col gap-3">
      <textarea value={text} onChange={(e) => setText(e.target.value)} readOnly={!canEdit} rows={16}
        aria-label="Note to the client"
        className="w-full rounded-md border border-rule bg-surface px-3 py-2 font-sans text-sm leading-6 read-only:bg-paper" />
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <button type="button" disabled={pending || !dirty} onClick={() => start(async () => setR(await saveAction(noteId, text)))}
            className="h-9 rounded-md border border-rule px-4 text-sm font-semibold hover:border-accent disabled:opacity-50">
            Save changes
          </button>
        )}
        {canApprove && (
          <button type="button" disabled={pending || dirty} onClick={() => start(async () => setR(await approveAction(noteId)))}
            className="h-9 rounded-md bg-clean px-4 text-sm font-semibold text-surface disabled:opacity-50">
            Approve and send
          </button>
        )}
        <span aria-live="polite" className={`text-sm ${r && !r.ok ? "text-rejected" : "text-muted"}`}>{r?.message}</span>
      </div>
    </div>
  );
}
