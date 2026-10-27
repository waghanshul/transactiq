import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BucketBadge } from "@/components/bucket-badge";
import { getDb } from "@/lib/db/client";
import { loadInsights, type Group } from "@/lib/data/insights";
import { BUCKETS, type Bucket } from "@/lib/reference/buckets";

export default function InsightsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Where the errors come from, so they can be fixed once at the source instead of every day in the queue.
          Synthetic data.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Adding up today&rsquo;s batch…</p>}>
        <Body />
      </Suspense>
    </div>
  );
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

async function Body() {
  await connection();
  const d = await loadInsights(getDb());
  if (!d.checked) {
    return (
      <p className="rounded-md border border-rule bg-surface px-4 py-3 text-sm">
        The checks haven&rsquo;t run yet. <Link href="/queue" className="font-semibold text-accent underline">Run them from the Queue</Link>.
      </p>
    );
  }
  const s = d.stp;
  const failing = s.total - s.clean;
  const caught = failing - s.held - s.compliance;
  const projected = s.clean + s.fixedBeforeSending + s.inProgress + s.toFix;

  return (
    <>
      <section className="rounded-lg border border-rule bg-surface p-5">
        <h2 className="text-lg font-bold">Outgoing batch: before and with TransactIQ</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Without checks, {failing} of {s.total} payments ({pct(failing, s.total)}%) would leave with an error and be rejected or
          repaired after sending. With checks, every one is stopped before sending; {s.fixedBeforeSending} {s.fixedBeforeSending === 1 ? "is" : "are"} already fixed and approved.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <StackedBar label="Before" total={s.total} parts={[
            { n: s.clean, label: "Sent clean", tone: "bg-clean" },
            { n: failing, label: "Fails after sending", tone: "bg-rejected" },
          ]} />
          <StackedBar label="With TransactIQ" total={s.total} parts={[
            { n: s.clean, label: "Sent clean", tone: "bg-clean" },
            { n: s.fixedBeforeSending, label: "Fixed before sending", tone: "bg-accent" },
            { n: s.inProgress, label: "Being repaired", tone: "bg-accent/60" },
            { n: s.toFix, label: "Fix suggested, not yet done", tone: "bg-review/70" },
            { n: s.needsClientOrDesk, label: "Waiting for client or desk", tone: "bg-review" },
            { n: s.held, label: "Held: possible duplicate", tone: "bg-muted" },
            { n: s.compliance, label: "With compliance", tone: "bg-compliance" },
          ]} />
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          <Kpi label="First-attempt success, before" value={`${pct(s.clean, s.total)}%`} detail={`${s.clean} of ${s.total} would go through first time`} />
          <Kpi label="With repairs approved so far" value={`${pct(s.clean + s.fixedBeforeSending, s.total)}%`} detail={`${s.fixedBeforeSending} fixed before sending`} />
          <Kpi label="If every suggested fix is approved" value={`${pct(projected, s.total)}%`} detail={`${caught} caught before sending; the rest need the client, the desk or compliance`} />
        </dl>
        <p className="mt-3 text-xs text-muted">
          &ldquo;First-attempt success&rdquo; here means accepted by the receiving bank first time. Repairs still need a human approval,
          so this is not no-touch STP; the gain is fewer rejects, fewer returns and no rework after sending.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold">Most common problems</h2>
        <p className="mt-1 text-sm text-muted">Payments affected, before sending and after rejection.</p>
        <ul className="mt-3 flex max-w-3xl flex-col gap-2">
          {d.buckets.map((b) => (
            <li key={b.bucket} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[16rem_1fr_auto]">
              <span className="flex items-center gap-2 text-sm"><BucketBadge bucket={b.bucket} /> {BUCKETS[b.bucket as Bucket].label}</span>
              <span className="col-span-2 row-start-2 block h-2 rounded-full bg-accent-soft sm:col-span-1 sm:row-start-auto" aria-hidden>
                <span className="block h-2 rounded-full bg-accent" style={{ width: `${pct(b.total, d.buckets[0].total)}%` }} />
              </span>
              <span className="text-sm tabular-nums">{b.total} <span className="text-muted">({b.prevent} before, {b.repair} after)</span></span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold">By client</h2>
        <p className="mt-1 text-sm text-muted">
          Highest error rate first. A client whose files keep failing the same way is a candidate for a note asking them to fix their records.
        </p>
        <GroupTable groups={d.byClient} first="Client" linkClients />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <h2 className="text-lg font-bold">By corridor</h2>
          <GroupTable groups={d.byCorridor} first="Corridor" />
        </section>
        <section className="min-w-0">
          <h2 className="text-lg font-bold">By channel</h2>
          <GroupTable groups={d.byChannel} first="Channel" />
        </section>
      </div>
    </>
  );
}

function StackedBar({ label, total, parts }: { label: string; total: number; parts: { n: number; label: string; tone: string }[] }) {
  const shown = parts.filter((p) => p.n > 0);
  return (
    <div>
      <p className="mb-1 text-sm font-semibold">{label}</p>
      <div className="flex h-5 overflow-hidden rounded-md" role="img" aria-label={`${label}: ${shown.map((p) => `${p.label} ${p.n}`).join(", ")}`}>
        {shown.map((p) => <span key={p.label} className={`${p.tone} border-r border-surface last:border-r-0`} style={{ width: `${(p.n / total) * 100}%` }} />)}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {shown.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5"><span className={`inline-block size-2.5 rounded-sm ${p.tone}`} aria-hidden />{p.label} <span className="tabular-nums text-muted">{p.n}</span></li>
        ))}
      </ul>
    </div>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md bg-paper px-4 py-3">
      <dt className="text-sm font-semibold">{label}</dt>
      <dd className="text-2xl font-bold">{value}</dd>
      <dd className="text-xs text-muted">{detail}</dd>
    </div>
  );
}

function GroupTable({ groups, first, linkClients }: { groups: Group[]; first: string; linkClients?: boolean }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-muted">
            <th className="py-2 font-semibold">{first}</th>
            <th className="py-2 text-right font-semibold">Payments</th>
            <th className="py-2 text-right font-semibold">With problems</th>
            <th className="py-2 pl-4 font-semibold">Most common</th>
            {linkClients && <th className="py-2"><span className="sr-only">Note</span></th>}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key} className="border-b border-rule">
              <td className="py-2">{g.label}{g.sub && <span className="block text-xs text-muted">{g.sub}</span>}</td>
              <td className="py-2 text-right tabular-nums">{g.payments}</td>
              <td className="py-2 text-right tabular-nums">
                {g.withProblems} <span className={pct(g.withProblems, g.payments) >= 40 ? "font-semibold text-rejected" : "text-muted"}>({pct(g.withProblems, g.payments)}%)</span>
              </td>
              <td className="py-2 pl-4">{g.topBucket ? <BucketBadge bucket={g.topBucket} /> : <span className="text-muted">None</span>}</td>
              {linkClients && (
                <td className="py-2 text-right">
                  {g.withProblems > 0 && <Link href={`/insights/${g.key}`} className="whitespace-nowrap font-semibold text-accent underline-offset-4 hover:underline">Note to client</Link>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
