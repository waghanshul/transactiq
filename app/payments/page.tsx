import Link from "next/link";
import { Suspense } from "react";
import { FilterForm } from "@/components/filter-form";
import { PaymentDrawer } from "@/components/payment-drawer";
import { filterOptions, listPayments, type PaymentFilters } from "@/lib/data/payments";
import { formatAmount, MSG_LABEL, relativeCutoff, STATUS_LABEL, STATUS_TONE } from "@/lib/format";

type Search = Promise<Record<string, string | string[] | undefined>>;

const FILTER_KEYS = ["mode", "corridor", "client", "status", "msgType", "q", "page", "view"] as const;

function pickParams(raw: Record<string, string | string[] | undefined>) {
  const out: Record<string, string | undefined> = {};
  for (const key of FILTER_KEYS) {
    const v = raw[key];
    const s = Array.isArray(v) ? v[0] : v;
    out[key] = s && s.length > 0 ? s : undefined;
  }
  return out;
}

function hrefWith(params: Record<string, string | undefined>, changes: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...changes })) if (v) next.set(k, v);
  const qs = next.toString();
  return qs ? `/payments?${qs}` : "/payments";
}

export default function PaymentsPage({ searchParams }: { searchParams: Search }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Outgoing messages waiting for pre-send checks, and sent payments that came back rejected.
          Sorted by cut-off, soonest first.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading payments…</p>}>
        <PaymentsView searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PaymentsView({ searchParams }: { searchParams: Search }) {
  const params = pickParams(await searchParams);
  const filters: PaymentFilters = { ...params, page: params.page ? Number(params.page) : 1 };
  const [list, options] = await Promise.all([listPayments(filters), filterOptions()]);
  const now = new Date();

  return (
    <>
      <FilterForm
        values={params}
        selects={[
          { name: "mode", label: "Mode", options: [{ value: "prevent", label: "Before sending" }, { value: "repair", label: "Rejected after sending" }] },
          { name: "corridor", label: "Corridor", options: options.corridors.map((c) => ({ value: c.id, label: c.label })) },
          { name: "client", label: "Client", options: options.clients.map((c) => ({ value: c.id, label: c.name })) },
          { name: "status", label: "Status", options: options.statuses.map((s) => ({ value: s, label: STATUS_LABEL[s] ?? s })) },
          { name: "msgType", label: "Message", options: [{ value: "pain.001", label: "pain.001 client instruction" }, { value: "pacs.008", label: "pacs.008 bank transfer" }] },
        ]}
      />

      <p className="text-sm text-muted" aria-live="polite">
        {list.total === 0
          ? "No payments match these filters. Clear a filter to see more."
          : `Showing ${(list.page - 1) * 50 + 1}–${Math.min(list.page * 50, list.total)} of ${list.total} payments`}
      </p>

      {list.total > 0 && (
        <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-rule text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Payment</th>
                <th scope="col" className="px-3 py-2 font-semibold">Client</th>
                <th scope="col" className="px-3 py-2 font-semibold">Creditor</th>
                <th scope="col" className="px-3 py-2 font-semibold">Corridor</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Amount</th>
                <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                <th scope="col" className="px-3 py-2 font-semibold">Cut-off</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((p) => {
                const selected = params.view === p.id;
                return (
                  <tr key={p.id} className={`border-b border-rule last:border-0 ${selected ? "bg-accent-soft" : "hover:bg-paper"}`}>
                    <td className="px-3 py-2">
                      <Link href={hrefWith(params, { view: p.id })} scroll={false} className="whitespace-nowrap font-mono font-semibold text-accent hover:underline">
                        {p.id}
                      </Link>
                      <div className="text-xs text-muted">{MSG_LABEL[p.msgType] ?? p.msgType}</div>
                    </td>
                    <td className="max-w-48 truncate px-3 py-2" title={p.clientName}>{p.clientName}</td>
                    <td className="max-w-56 truncate px-3 py-2" title={p.creditorName ?? ""}>{p.creditorName || <span className="text-review">Missing</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2">{p.corridor}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formatAmount(p.amount)} <span className="text-xs text-muted">{p.currency}</span>
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 ${STATUS_TONE[p.status] ?? ""}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                      {p.rejectReasonCode && <span className="ml-1 font-mono text-xs">{p.rejectReasonCode}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{relativeCutoff(p.cutoffAt, now)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {list.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-4 text-sm">
          {list.page > 1 ? (
            <Link href={hrefWith(params, { page: String(list.page - 1), view: undefined })} className="font-semibold text-accent">Previous page</Link>
          ) : <span className="text-muted">Previous page</span>}
          <span className="text-muted">Page {list.page} of {list.pages}</span>
          {list.page < list.pages ? (
            <Link href={hrefWith(params, { page: String(list.page + 1), view: undefined })} className="font-semibold text-accent">Next page</Link>
          ) : <span className="text-muted">Next page</span>}
        </nav>
      )}

      {params.view && <PaymentDrawer id={params.view} closeHref={hrefWith(params, { view: undefined })} />}
    </>
  );
}
