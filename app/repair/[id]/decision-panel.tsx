"use client";

import { useState, useTransition } from "react";
import { decideAction, startAction, submitAction, type ActionResult } from "./actions";

type Mode =
  | { kind: "start" }
  | { kind: "submit"; ready: boolean; changes: number }
  | { kind: "decide" }
  | { kind: "none" };

export function DecisionPanel({ paymentId, mode }: { paymentId: string; mode: Mode }) {
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<ActionResult>) => start(async () => setResult(await fn()));

  return (
    <div className="flex flex-col gap-3">
      {mode.kind === "start" && (
        <button type="button" disabled={pending} onClick={() => act(() => startAction(paymentId))}
          className="h-10 rounded-md bg-accent px-5 font-semibold text-surface disabled:opacity-60">
          {pending ? "Starting…" : "Start repair"}
        </button>
      )}
      {mode.kind === "submit" && (
        <button type="button" disabled={pending || !mode.ready} onClick={() => act(() => submitAction(paymentId))}
          className="h-10 rounded-md bg-accent px-5 font-semibold text-surface disabled:opacity-50">
          {pending ? "Checking and submitting…" : `Submit ${mode.changes === 1 ? "1 change" : `${mode.changes} changes`} for approval`}
        </button>
      )}
      {mode.kind === "decide" && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Comment (required to send back)</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
              className="rounded-md border border-rule bg-surface px-2 py-1.5" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => act(() => decideAction(paymentId, "approve", comment))}
              className="h-10 rounded-md bg-clean px-5 font-semibold text-surface disabled:opacity-60">Approve</button>
            <button type="button" disabled={pending} onClick={() => act(() => decideAction(paymentId, "send_back", comment))}
              className="h-10 rounded-md border border-rule px-5 font-semibold hover:border-accent disabled:opacity-60">Send back</button>
          </div>
        </>
      )}
      <p aria-live="polite" className={`text-sm ${result?.ok ? "text-clean" : "text-rejected"}`}>{result?.message}</p>
    </div>
  );
}
