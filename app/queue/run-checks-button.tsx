"use client";

import { useActionState } from "react";
import { runChecksAction, type RunState } from "./actions";

export function RunChecksButton({ label }: { label: string }) {
  const [state, action, pending] = useActionState<RunState | null>(async () => runChecksAction(), null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-md bg-accent px-5 font-semibold text-surface disabled:opacity-60"
      >
        {pending ? "Checking 340 messages…" : label}
      </button>
      <span aria-live="polite" className="text-sm">
        {state && !state.ok && <span className="text-rejected">{state.message}</span>}
        {state?.ok && state.summary && (
          <span className="text-muted">
            Checked {state.summary.checked} messages in {(state.summary.ms / 1000).toFixed(1)} s.
          </span>
        )}
      </span>
    </form>
  );
}
