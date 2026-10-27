import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BucketBadge } from "@/components/bucket-badge";
import { PaymentDrawer } from "@/components/payment-drawer";
import { queueItems, statusCounts, type QueueTab } from "@/lib/data/queue";
import { formatAmount, relativeCutoff, STATUS_LABEL, STATUS_TONE } from "@/lib/format";
import { BUCKETS, type Bucket } from "@/lib/reference/buckets";
import { RunChecksButton } from "./run-checks-button";

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

function href(params: { tab: QueueTab; bucket?: string; view?: string }) {
  const q = new URLSearchParams();
  q.set("tab", params.tab);
  if (params.bucket) q.set("bucket", params.bucket);
  if (params.view) q.set("view", params.view);
  return `/queue?${q.toString()}`;
}

export default function QueuePage({ searchParams }: { searchParams: Search }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Queue</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Payments that need a person: problems caught before sending, and payments the receiving bank rejected.
          Soonest cut-off first.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading the queue…</p>}>
        <QueueView searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function QueueView({ searchParams }: { searchParams: Search }) {
  const raw = await searchParams;
  const tab: QueueTab = one(raw.tab) === "repair" ? "repair" : "prevent";
  const bucket = one(raw.bucket);
  const view = one(raw.view);
  await connection();
  const now = new Date();

  const [counts, allItems] = await Promise.all([statusCounts(), queueItems(tab)]);
  const n = (mode: string, status: string) => counts.find((c) => c.mode === mode && c.status === status)?.n ?? 0;
  const notChecked = n("prevent", "new");
  const checked = counts.filter((c) => c.mode === "prevent" && c.status !== "new").reduce((s, c) => s + c.n, 0);
  const items = bucket ? allItems.filter((i) => i.buckets.includes(Number(bucket))) : allItems;

  const bucketCounts = new Map<number, number>();
  for (const i of allItems) for (const b of i.buckets) bucketCounts.set(b, (bucketCounts.get(b) ?? 0) + 1);

  return (
    <>
      {notChecked > 0 && checked === 0 ? (
        <section className="rounded-lg border border-rule bg-surface p-5">
          <h2 className="font-semibold">{notChecked} outgoing messages haven’t been checked yet</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            The checks run 22 rules covering addresses, party data, accounts, bank codes, purpose codes, format,
            duplicates, corridor limits and a sanctions-name screen. Rejected payments get their reason code explained.
          </p>
          <div className="mt-4"><RunChecksButton label="Run pre-send checks" /></div>
        </section>
      ) : (
        <section aria-label="Results of the last check" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat value={n("prevent", "ready")} label="Passed, ready to send" tone="text-clean" />
          <Stat value={n("prevent", "flagged")} label="Need repair" tone="text-review" />
          <Stat value={n("prevent", "held")} label="Held as possible duplicates" tone="text-review" />
          <Stat value={n("prevent", "compliance")} label="Sent to compliance" tone="text-compliance" />
          <Stat value={n("repair", "rejected")} label="Rejected after sending" tone="text-rejected" />
        </section>
      )}

      {checked > 0 && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule">
            <nav aria-label="Queue" className="flex gap-1">
              <TabLink active={tab === "prevent"} href={href({ tab: "prevent" })}>
                Before sending <span className="text-muted">{n("prevent", "flagged") + n("prevent", "held") + n("prevent", "compliance")}</span>
              </TabLink>
              <TabLink active={tab === "repair"} href={href({ tab: "repair" })}>
                Rejected after sending <span className="text-muted">{n("repair", "rejected")}</span>
              </TabLink>
            </nav>
            <div className="pb-2"><RunChecksButton label="Run checks again" /></div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Filter by problem:</span>
            <Link href={href({ tab })} className={`rounded-full border px-3 py-1 ${!bucket ? "border-accent bg-accent-soft font-semibold" : "border-rule"}`}>
              All {allItems.length}
            </Link>
            {[...bucketCounts.entries()].sort((a, b) => a[0] - b[0]).map(([b, c]) => (
              <Link
                key={b}
                href={href({ tab, bucket: String(b) })}
                className={`rounded-full border px-3 py-1 ${bucket === String(b) ? "border-accent bg-accent-soft font-semibold" : "border-rule"}`}
              >
                {BUCKETS[b as Bucket].label} {c}
              </Link>
            ))}
          </div>

          {items.length === 0 ? (
            <p className="rounded-md border border-rule bg-surface px-4 py-3 text-sm">Nothing waiting here. Every payment in this view is clear.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((i) => (
                <li key={i.id}>
                  <Link
                    href={href({ tab, bucket, view: i.id })}
                    scroll={false}
                    className={`grid gap-x-4 gap-y-1 rounded-lg border bg-surface px-4 py-3 sm:grid-cols-[8rem_1fr_auto] ${view === i.id ? "border-accent" : "border-rule hover:border-accent"}`}
                  >
                    <span>
                      <span className="block font-mono font-semibold text-accent">{i.id}</span>
                      <span className={`block text-xs ${STATUS_TONE[i.status]}`}>
                        {STATUS_LABEL[i.status]}{i.rejectReasonCode ? ` ${i.rejectReasonCode}` : ""}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {i.buckets.map((b) => <BucketBadge key={b} bucket={b} />)}
                        <span className="truncate text-sm">{i.clientName} to {i.creditorName || "unnamed creditor"}</span>
                      </span>
                      <span className="mt-1 block text-sm text-muted">
                        {i.first ?? "Nothing in the message explains the rejection; check with the receiving bank or client."}
                        {i.count > 1 ? ` (+${i.count - 1} more)` : ""}
                      </span>
                    </span>
                    <span className="text-sm sm:text-right">
                      <span className="block whitespace-nowrap">{formatAmount(i.amount)} <span className="text-xs text-muted">{i.currency}</span></span>
                      <span className="block whitespace-nowrap text-xs text-muted">Cut-off {relativeCutoff(i.cutoffAt, now)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {view && <PaymentDrawer id={view} closeHref={href({ tab, bucket })} />}
    </>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="rounded-lg border border-rule bg-surface px-4 py-3">
      <span className={`block text-2xl font-bold ${tone}`}>{value}</span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}

function TabLink({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}
