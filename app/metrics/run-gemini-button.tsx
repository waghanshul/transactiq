"use client";

import { useState, useTransition } from "react";
import { runGeminiAction } from "./actions";

export function RunGeminiButton({ label }: { label: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; message: string }>();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending} onClick={() => start(async () => setMsg(await runGeminiAction()))}
        className="h-9 rounded-md border border-accent px-4 text-sm font-semibold text-accent hover:bg-accent-soft disabled:opacity-60">
        {pending ? "Asking Gemini…" : label}
      </button>
      <span aria-live="polite" className={`text-sm ${msg?.ok ? "text-muted" : "text-rejected"}`}>{msg?.message}</span>
    </div>
  );
}
