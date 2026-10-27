"use client";

import { useState, useTransition } from "react";
import { ConfidenceBar, FIELD_LABEL, SOURCE_LABEL, ValueView } from "@/components/repair-value";
import type { PostalAddress } from "@/lib/iso/types";
import type { RepairValue, Suggestion } from "@/lib/suggest/types";
import { dismissAction, setChangeAction, undoAction, type ActionResult } from "./actions";

export interface CardSuggestion extends Suggestion {
  id: number;
}

export interface CardChange {
  newValue: RepairValue;
  how: "accepted" | "edited" | "manual";
  by: string;
}

interface Props {
  paymentId: string;
  fieldPath: string;
  current?: RepairValue;
  problems: string[];
  suggestion?: CardSuggestion;
  change?: CardChange;
  dismissed: boolean;
  canEdit: boolean;
  threshold: number;
}

export function SuggestionCard(p: Props) {
  const [editing, setEditing] = useState<RepairValue | null>(null);
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const s = p.suggestion;
  const confident = !!s && s.confidence >= p.threshold;
  const isAddress = p.fieldPath.endsWith("/PstlAdr");

  const act = (fn: () => Promise<ActionResult>) => start(async () => {
    const r = await fn();
    setResult(r);
    if (r.ok) setEditing(null);
  });

  const blank: RepairValue = isAddress
    ? { ...(typeof p.current === "object" ? p.current : {}), TwnNm: "", Ctry: "" }
    : "";

  return (
    <article className="rounded-lg border border-rule bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-3">
        <h3 className="font-semibold">{FIELD_LABEL[p.fieldPath] ?? p.fieldPath}</h3>
        <span className="font-mono text-xs text-muted">{p.fieldPath}</span>
      </header>
      <div className="grid gap-4 px-4 py-3 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">In the message now</p>
          <ValueView value={p.current} />
          <ul className="mt-2 flex flex-col gap-1 text-sm text-review">
            {p.problems.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>

        <div>
          {p.change ? (
            <>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-clean">
                In this repair ({p.change.how === "accepted" ? "suggestion accepted" : p.change.how === "edited" ? "suggestion edited" : "typed by hand"})
              </p>
              <ValueView value={p.change.newValue} highlight={p.current ?? {}} />
              {p.canEdit && (
                <div className="mt-3 flex gap-2">
                  <Btn onClick={() => setEditing(p.change!.newValue)} disabled={pending}>Change</Btn>
                  <Btn onClick={() => act(() => undoAction(p.paymentId, p.fieldPath))} disabled={pending}>Undo</Btn>
                </div>
              )}
            </>
          ) : s && !p.dismissed ? (
            <>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
                {confident ? "Suggested" : "Not sure enough to suggest a value"}
              </p>
              {confident ? <ValueView value={s.newValue} highlight={p.current ?? {}} /> : null}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <ConfidenceBar value={s.confidence} threshold={p.threshold} />
                <span title={SOURCE_LABEL[s.source]?.hint} className="rounded border border-rule px-1.5 py-px text-xs">
                  {SOURCE_LABEL[s.source]?.label ?? s.source}
                </span>
              </div>
              <p className="mt-2 text-sm">{s.reason}</p>
              {s.checks?.length ? (
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted">{s.checks.map((c) => <li key={c}>{c}</li>)}</ul>
              ) : null}
              {!confident && s.options?.length ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">Possible:</span>
                  {s.options.slice(0, 4).map((o, i) => (
                    <button key={i} type="button" disabled={!p.canEdit} onClick={() => setEditing(o)}
                      className="rounded-full border border-rule px-2.5 py-0.5 hover:border-accent disabled:opacity-60">
                      {typeof o === "string" ? o : `${(o as PostalAddress).TwnNm}, ${(o as PostalAddress).Ctry}`}
                    </button>
                  ))}
                </div>
              ) : null}
              {p.canEdit && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {confident && (
                    <Btn primary disabled={pending} onClick={() => act(() => setChangeAction(p.paymentId, {
                      fieldPath: p.fieldPath, newValue: s.newValue, how: "accepted", suggestionId: s.id, source: s.source, confidence: s.confidence, oldValue: p.current,
                    }))}>Accept</Btn>
                  )}
                  <Btn disabled={pending} onClick={() => setEditing(confident ? s.newValue : blank)}>{confident ? "Edit" : "Fill in by hand"}</Btn>
                  {confident && <Btn disabled={pending} onClick={() => act(() => dismissAction(p.paymentId, s.id, p.fieldPath))}>Dismiss</Btn>}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {p.dismissed ? "Suggestion dismissed" : "No suggestion"}
              </p>
              <p className="text-sm text-muted">
                {p.dismissed ? "Type the right value yourself." : "Nothing reliable to suggest from the message, the bank's records or history. Type the right value, or ask the client."}
              </p>
              {p.canEdit && <div className="mt-3"><Btn onClick={() => setEditing(blank)} disabled={pending}>Fill in by hand</Btn></div>}
            </>
          )}
        </div>
      </div>

      {editing !== null && (
        <Editor
          isAddress={isAddress}
          initial={editing}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(v) => act(() => setChangeAction(p.paymentId, {
            fieldPath: p.fieldPath, newValue: v, oldValue: p.current,
            how: s && JSON.stringify(v) === JSON.stringify(s.newValue) ? "accepted" : s && !p.dismissed && confident ? "edited" : "manual",
            suggestionId: s?.id, source: s?.source, confidence: s?.confidence,
          }))}
        />
      )}
      {result && !result.ok && <p role="alert" className="border-t border-rule px-4 py-2 text-sm text-rejected">{result.message}</p>}
    </article>
  );
}

function Btn({ children, onClick, disabled, primary }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`h-9 rounded-md px-4 text-sm font-semibold disabled:opacity-60 ${primary ? "bg-accent text-surface" : "border border-rule hover:border-accent"}`}>
      {children}
    </button>
  );
}

const ADDRESS_FIELDS: { key: keyof PostalAddress; label: string; wide?: boolean }[] = [
  { key: "TwnNm", label: "Town (TwnNm)" },
  { key: "Ctry", label: "Country code (Ctry)" },
  { key: "PstCd", label: "Postcode (PstCd)" },
  { key: "CtrySubDvsn", label: "State or region" },
  { key: "StrtNm", label: "Street (StrtNm)" },
  { key: "BldgNb", label: "Building no." },
  { key: "PstBx", label: "PO Box" },
];

function Editor({ isAddress, initial, pending, onSave, onCancel }: {
  isAddress: boolean; initial: RepairValue; pending: boolean; onSave: (v: RepairValue) => void; onCancel: () => void;
}) {
  const [text, setText] = useState(typeof initial === "string" ? initial : "");
  const [addr, setAddr] = useState<PostalAddress>(typeof initial === "object" ? initial : {});
  const lines = addr.AdrLine ?? [];
  const setLine = (i: number, v: string) => setAddr({ ...addr, AdrLine: [0, 1].map((k) => (k === i ? v : lines[k] ?? "")).filter((l, k) => l || k < 1) });

  return (
    <form
      className="border-t border-rule bg-paper px-4 py-3"
      onSubmit={(e) => { e.preventDefault(); onSave(isAddress ? { ...addr, AdrLine: (addr.AdrLine ?? []).filter(Boolean) } : text); }}
    >
      {isAddress ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {ADDRESS_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-sm">
              <span className="text-muted">{f.label}</span>
              <input
                value={(addr[f.key] as string) ?? ""}
                maxLength={f.key === "Ctry" ? 2 : 70}
                required={f.key === "TwnNm" || f.key === "Ctry"}
                onChange={(e) => setAddr({ ...addr, [f.key]: f.key === "Ctry" ? e.target.value.toUpperCase() : e.target.value })}
                className="h-9 rounded-md border border-rule bg-surface px-2 font-mono"
              />
            </label>
          ))}
          {[0, 1].map((i) => (
            <label key={i} className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-muted">Free-text line {i + 1} (AdrLine, at most 70 characters, no town or country)</span>
              <input value={lines[i] ?? ""} maxLength={70} onChange={(e) => setLine(i, e.target.value)}
                className="h-9 rounded-md border border-rule bg-surface px-2 font-mono" />
            </label>
          ))}
        </div>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">New value</span>
          <input value={text} onChange={(e) => setText(e.target.value)} required maxLength={140}
            className="h-9 rounded-md border border-rule bg-surface px-2 font-mono" />
        </label>
      )}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={pending} className="h-9 rounded-md bg-accent px-4 text-sm font-semibold text-surface disabled:opacity-60">
          {pending ? "Saving…" : "Use this value"}
        </button>
        <button type="button" onClick={onCancel} className="h-9 rounded-md border border-rule px-4 text-sm font-semibold">Cancel</button>
      </div>
    </form>
  );
}
