"use client";

import { useState } from "react";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

interface Field { key: "E" | "C" | "p" | "r" | "D"; label: string; hint: string; min: number; max: number; step: number; percent?: boolean }

const FIELDS: Field[] = [
  { key: "E", label: "E: exceptions per day", hint: "Cross-border payments that fail or need repair", min: 0, max: 100000, step: 10 },
  { key: "C", label: "C: cost per exception (USD)", hint: "Handling, investigation, fees, delay", min: 0, max: 500, step: 0.1 },
  { key: "p", label: "p: share prevented before sending", hint: "Caught and fixed before Swift sees them", min: 0, max: 100, step: 1, percent: true },
  { key: "r", label: "r: effort saved on the rest", hint: "Faster repair of what still fails", min: 0, max: 100, step: 1, percent: true },
  { key: "D", label: "D: working days a year", hint: "", min: 0, max: 366, step: 1 },
];

const DEFAULTS = { E: 500, C: 12.1, p: 30, r: 50, D: 250 };

export function Calculator() {
  const [v, setV] = useState(DEFAULTS);
  const p = v.p / 100, r = v.r / 100;
  const share = p + (1 - p) * r;
  const annual = v.E * v.C * share * v.D;
  const today = v.E * v.C * v.D;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{f.label}</span>
            <span className="flex items-center gap-2">
              <input type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step} value={v[f.key]}
                onChange={(e) => setV({ ...v, [f.key]: Math.min(f.max, Math.max(f.min, Number(e.target.value) || 0)) })}
                className="h-10 w-36 rounded-md border border-rule bg-surface px-2 font-mono" />
              {f.percent && <span className="text-muted">%</span>}
            </span>
            {f.hint && <span className="text-xs text-muted">{f.hint}</span>}
          </label>
        ))}
        <div className="sm:col-span-2">
          <button type="button" onClick={() => setV(DEFAULTS)} className="text-sm font-semibold text-accent underline-offset-4 hover:underline">
            Reset to the illustrative scenario
          </button>
        </div>
      </form>
      <div className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5" aria-live="polite">
        <p className="text-sm text-muted">Annual saving</p>
        <p className="text-4xl font-bold tabular-nums">{usd(annual)}</p>
        <p className="font-mono text-xs text-muted">
          {v.E} × {v.C.toFixed(2)} × ({p.toFixed(2)} + {(1 - p).toFixed(2)} × {r.toFixed(2)}) × {v.D}
        </p>
        <p className="text-sm">
          Exceptions cost {usd(today)} a year today; this saves {Math.round(share * 100)}% of it.
        </p>
      </div>
    </div>
  );
}
