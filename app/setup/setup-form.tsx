"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setupDemo, type SetupState } from "./actions";

export function SetupForm() {
  const [state, action, pending] = useActionState<SetupState | null, FormData>(setupDemo, null);

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
          Reset secret
          <input
            type="password"
            name="secret"
            required
            autoComplete="off"
            className="h-10 rounded-md border border-rule bg-surface px-3 text-ink"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-md bg-accent px-5 font-semibold text-surface disabled:opacity-60"
        >
          {pending ? "Setting up…" : "Set up demo data"}
        </button>
      </form>

      <div aria-live="polite">
        {state && !state.ok && (
          <p className="rounded-md border-l-4 border-rejected bg-surface px-4 py-3 text-sm">{state.message}</p>
        )}
        {state?.ok && state.summary && (
          <div className="rounded-md border-l-4 border-clean bg-surface px-4 py-3 text-sm">
            <p className="font-semibold">{state.message}</p>
            <p className="mt-1 text-muted">
              Loaded {state.summary.prevent} messages to check, {state.summary.repair} rejected payments,{" "}
              {state.summary.clients} clients and {state.summary.answerKey} answer-key rows in{" "}
              {(state.summary.ms / 1000).toFixed(1)} s.
            </p>
            <Link href="/payments" className="mt-2 inline-block font-semibold text-accent underline-offset-4 hover:underline">
              Open payments
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
