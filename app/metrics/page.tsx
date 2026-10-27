import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BucketBadge } from "@/components/bucket-badge";
import { currentMetrics } from "@/lib/data/metrics";
import { BUCKETS, type Bucket } from "@/lib/reference/buckets";
import { RULES } from "@/lib/rules/engine";

export default function MetricsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Metrics</h1>
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

      <p className="text-sm text-muted">
        Time saved and first-time-right rate arrive with the repair workflow in Sprint 3; they need real approvals to measure.
      </p>
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
