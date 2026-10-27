"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { clientMessageAction, viewAction } from "./actions";

/** Writes one "view" entry to the audit trail when the page opens. */
export function ViewLogger({ paymentId }: { paymentId: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void viewAction(paymentId);
  }, [paymentId]);
  return null;
}

export function CopyMessage({ paymentId, text, canLog }: { paymentId: string; text: string; canLog: boolean }) {
  const [state, setState] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be blocked */ }
          if (canLog) {
            const r = await clientMessageAction(paymentId);
            setState(r.ok ? "Copied. Logged in the audit trail." : r.message);
          } else setState("Copied.");
        })}
        className="rounded-md border border-accent px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent-soft"
      >
        Copy message
      </button>
      <span aria-live="polite" className="text-sm text-muted">{state}</span>
    </div>
  );
}
