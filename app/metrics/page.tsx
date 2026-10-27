import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BucketBadge } from "@/components/bucket-badge";
import { geminiScore, rulesScore } from "@/lib/data/benchmark";
import { finalMetrics } from "@/lib/data/final-metrics";
import { currentMetrics, repairMetrics } from "@/lib/data/metrics";
import { getDb } from "@/lib/db/client";
import { suggestConfig } from "@/lib/suggest/config";
import { RunGeminiButton } from "./run-gemini-button";
import { BUCKETS, type Bucket } from "@/lib/reference/buckets";
import { RULES } from "@/lib/rules/engine";

export default function MetricsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex flex-wrap items-baseline gap-3 text-2xl font-bold tracking-tight">
          Metrics <span className="rounded border border-review px-2 py-0.5 text-xs font-semibold text-review">Synthetic data</span>
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Every error in the synthetic data was seeded on purpose and recorded in an answer key. This page scores the
          checks against it. The rules never see the answer key; it is only read here, after they run.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Scoring the last run…</p>}>
        <Scores />
      </Suspense>
    </div>
  );
}

const pct = (a: number, b: number) => (b === 0 ? "–" : `${Math.round((a / b) * 100)}%`);

async function Scores() {
  await connection();
  const { checked, evaluation: e, ruleHits } = await currentMetrics();

  if (!checked) {
    return (
      <p className="rounded-md border border-rule bg-surface px-4 py-3 text-sm">
        The checks haven’t run yet.{" "}
        <Link href="/queue" className="font-semibold text-accent underline-offset-4 hover:underline">Run them from the Queue</Link>{" "}
        and come back for the scores.
      </p>
    );
  }

  const p = e.prevent;
  const precisionFlags = p.caught + p.falsePositives.length;

  return (
    <>
      <section aria-label="Headline scores" className="grid gap-3 sm:grid-cols-4">
        <Score value={pct(p.caught, p.seeded)} label="Seeded errors caught before sending" detail={`${p.caught} of ${p.seeded}`} />
        <Score value={String(p.falsePositives.length)} label="Clean payments wrongly flagged" detail={`of ${p.cleanPayments} clean; precision ${pct(p.caught, precisionFlags)}`} />
        <Score value={pct(e.repair.explained, e.repair.total)} label="Rejects explained correctly" detail={`${e.repair.explained} of ${e.repair.total} pacs.002 rejects`} />
        <Score
          value={pct(e.repair.caughtBeforeSending, e.repair.detectableBeforeSending)}
          label="Rejects the checks would have stopped"
          detail={`${e.repair.caughtBeforeSending} of ${e.repair.detectableBeforeSending} that were visible in the message`}
        />
      </section>

      <section>
        <h2 className="text-lg font-bold">Caught by problem type</h2>
        <table className="mt-3 w-full max-w-3xl text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-muted">
              <th className="py-2 font-semibold">Problem</th>
              <th className="py-2 text-right font-semibold">Seeded</th>
              <th className="py-2 text-right font-semibold">Caught</th>
              <th className="w-1/3 py-2 pl-4 font-semibold"><span className="sr-only">Share caught</span></th>
            </tr>
          </thead>
          <tbody>
            {p.byBucket.map((b) => (
              <tr key={b.bucket} className="border-b border-rule">
                <td className="py-2"><span className="flex items-center gap-2"><BucketBadge bucket={b.bucket} /> {BUCKETS[b.bucket as Bucket].label}</span></td>
                <td className="py-2 text-right tabular-nums">{b.seeded}</td>
                <td className="py-2 text-right tabular-nums">{b.caught}</td>
                <td className="py-2 pl-4">
                  <span className="block h-2 rounded-full bg-accent-soft" aria-hidden>
                    <span className="block h-2 rounded-full bg-clean" style={{ width: `${(b.caught / Math.max(b.seeded, 1)) * 100}%` }} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {p.missed.length > 0 && (
          <p className="mt-3 text-sm text-rejected">Missed: {p.missed.map((m) => m.paymentId).join(", ")}</p>
        )}
        {p.extraFindings.length > 0 && (
          <p className="mt-3 text-sm text-muted">{p.extraFindings.length} payments also had a finding outside their seeded problem type.</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold">What each rule found</h2>
        <p className="mt-1 text-sm text-muted">Findings per rule across all 340 messages in the last run, including rejected ones.</p>
        <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {RULES.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-3 border-b border-rule py-1.5">
              <span><span className="font-mono text-xs text-muted">{r.id}</span> {r.title}</span>
              <span className="tabular-nums">{ruleHits.get(r.id) ?? 0}</span>
            </li>
          ))}
        </ul>
      </section>

      <Suspense fallback={<p className="text-sm text-muted">Scoring the suggestions…</p>}>
        <SuggestionScores />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted">Reading the audit trail…</p>}>
        <WorkflowScores />
      </Suspense>
    </>
  );
}

function Score({ value, label, detail }: { value: string; label: string; detail: string }) {
  return (
    <div className="rounded-lg border border-rule bg-surface px-4 py-3">
      <span className="block text-3xl font-bold">{value}</span>
      <span className="mt-1 block text-sm font-semibold">{label}</span>
      <span className="block text-xs text-muted">{detail}</span>
    </div>
  );
}

async function SuggestionScores() {
  const m = await repairMetrics();
  const s = m.score;
  const rules = rulesScore();
  const gemini = await geminiScore(getDb());
  const threshold = Math.round(m.threshold * 100);
  return (
    <>
      <section className="border-t border-rule pt-6">
        <h2 className="text-lg font-bold">Suggested fixes</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Only suggestions at or above {threshold}% confidence are shown to the analyst; below that the panel offers options
          or a blank field. Accuracy is measured on the suggestions actually shown.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Score value={pct(s.address.right, s.address.shown)} label="Address suggestions right" detail={`${s.address.right} of ${s.address.shown} shown (town and country). Target 95%.`} />
          <Score value={pct(s.other.right, s.other.shown)} label="Other suggestions right" detail={`${s.other.right} of ${s.other.shown}: BICs, purpose codes, names, dates, references`} />
          <Score value={pct(s.coverage.withSuggestion, s.coverage.fixable)} label="Fixable errors with a suggestion" detail={`${s.coverage.withSuggestion} of ${s.coverage.fixable}. Accounts and amounts never get one.`} />
          <Score value={String(m.repairs.approved)} label="Repairs approved" detail={`${m.repairs.firstTimeRight} first time right, ${m.repairs.sentBack} sent back, ${m.repairs.open} open`} />
        </div>
        {(m.changes.accepted + m.changes.edited + m.changes.manual) > 0 && (
          <p className="mt-3 text-sm text-muted">
            In repairs so far: {m.changes.accepted} suggestions accepted as shown, {m.changes.edited} edited, {m.changes.manual} values typed by hand.
          </p>
        )}
        {s.wrong.length > 0 && <p className="mt-2 text-sm text-rejected">Wrong: {s.wrong.map((w) => `${w.paymentId} (${w.got}, expected ${w.want})`).join("; ")}</p>}
      </section>

      <section>
        <h2 className="text-lg font-bold">Address engine on 150 test addresses</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          A separate, messier set: old town names, typos, capitals, one-line addresses, missing countries, Japanese block
          addresses with no town, and 10 real towns that aren&rsquo;t in the reference list. No bank record is available, so the
          engine works from the text alone.
        </p>
        <table className="mt-3 w-full max-w-3xl text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-muted">
              <th className="py-2 font-semibold">Engine</th>
              <th className="py-2 text-right font-semibold">Shown</th>
              <th className="py-2 text-right font-semibold">Right when shown</th>
              <th className="py-2 text-right font-semibold">Said &ldquo;not sure&rdquo;</th>
            </tr>
          </thead>
          <tbody>
            {[rules, gemini].map((e) => (
              <tr key={e.engine} className="border-b border-rule">
                <td className="py-2">{e.engine}</td>
                {e.ran ? (
                  <>
                    <td className="py-2 text-right tabular-nums">{e.shown} of {e.total}</td>
                    <td className="py-2 text-right tabular-nums">{pct(e.shownRight, e.shown)}</td>
                    <td className="py-2 text-right tabular-nums">{e.unsure}</td>
                  </>
                ) : (
                  <td className="py-2 text-right text-muted" colSpan={3}>{e.note}</td>
                )}
              </tr>
            ))}
            <tr className="border-b border-rule text-muted">
              <td className="py-2">Swift address model, open-source structured-address tools</td>
              <td className="py-2 text-right" colSpan={3}>Not run in this POC (see DECISIONS.md)</td>
            </tr>
          </tbody>
        </table>
        <details className="mt-2 max-w-3xl text-sm">
          <summary className="cursor-pointer text-muted">Rules-only results by address style</summary>
          <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
            {rules.byStyle.map((b) => (
              <li key={b.style} className="flex justify-between border-b border-rule py-1">
                <span>{b.style}</span>
                <span className="tabular-nums">{b.right}/{b.total} right, {b.total - b.shown} unsure</span>
              </li>
            ))}
          </ul>
        </details>
        {suggestConfig.geminiEnabled && (
          <div className="mt-3"><RunGeminiButton label={gemini.ran ? "Run Gemini again" : `Ask Gemini about the ${rules.unsure} unsure addresses`} /></div>
        )}
      </section>
    </>
  );
}

const mins = (n?: number) => (n === undefined ? "–" : n < 1 ? `${Math.max(1, Math.round(n * 60))} s` : `${n.toFixed(1)} min`);

async function WorkflowScores() {
  const f = await finalMetrics(getDb());
  const b = f.time.baseline;
  return (
    <>
      <section className="border-t border-rule pt-6">
        <h2 className="text-lg font-bold">Repair work</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Score
            value={f.acceptance.rate === undefined ? "–" : `${Math.round(f.acceptance.rate * 100)}%`}
            label="Suggestions accepted as shown"
            detail={`${f.acceptance.accepted} accepted, ${f.acceptance.edited} edited, ${f.acceptance.dismissed} dismissed; ${f.acceptance.manual} values typed by hand`}
          />
          <Score
            value={mins(f.time.makerMedian)}
            label="Median time to repair (maker)"
            detail={`From opening the payment to submitting, over ${f.time.repairs} ${f.time.repairs === 1 ? "repair" : "repairs"}. Approval included: ${mins(f.time.endToEndMedian)}.`}
          />
          <Score
            value={b.median === undefined ? "Not timed yet" : mins(b.median)}
            label="Manual baseline, same errors by hand"
            detail={b.median === undefined
              ? "Time yourself fixing the 20 errors in docs/manual-baseline.csv (edit it on GitHub) to get the before number."
              : `Median of ${b.timed} errors fixed by hand from the raw XML.`}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold">Guardrails</h2>
        <p className="mt-1 text-sm text-muted">Each of these must stay at zero. They are counted from the data, not assumed.</p>
        <ul className="mt-3 grid max-w-3xl gap-x-6 sm:grid-cols-2">
          {f.guardrails.map((g) => (
            <li key={g.label} className="flex items-baseline justify-between gap-3 border-b border-rule py-2 text-sm">
              <span>{g.label}{g.n > 0 && g.detail ? <span className="block text-xs text-rejected">{g.detail}</span> : null}</span>
              <span className={`font-bold tabular-nums ${g.n === 0 ? "text-clean" : "text-rejected"}`}>{g.n}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold">How the tool is used</h2>
        <p className="mt-1 text-sm text-muted">Product events, counted from the audit trail.</p>
        <ol className="mt-3 flex max-w-3xl flex-col gap-1.5">
          {f.funnel.map((e) => (
            <li key={e.event} className="grid grid-cols-[1fr_auto] items-center gap-x-4 sm:grid-cols-[18rem_1fr_auto]">
              <span className="text-sm">{e.label} <span className="font-mono text-xs text-muted">{e.event}</span></span>
              <span className="col-span-2 row-start-2 block h-2 rounded-full bg-accent-soft sm:col-span-1 sm:row-start-auto" aria-hidden>
                <span className="block h-2 rounded-full bg-accent" style={{ width: `${f.funnel[0].n ? Math.min(100, (e.n / f.funnel[0].n) * 100) : 0}%` }} />
              </span>
              <span className="text-sm tabular-nums">{e.n}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-sm text-muted">
        What would this be worth? <Link href="/business-case" className="font-semibold text-accent underline-offset-4 hover:underline">Plug in your own numbers</Link>.
      </p>
    </>
  );
}
