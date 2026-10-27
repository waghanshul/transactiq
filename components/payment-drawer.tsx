import Link from "next/link";
import { CloseOnEscape } from "@/components/close-on-escape";
import { XmlView } from "@/components/xml-view";
import { getPayment } from "@/lib/data/payments";
import { formatAmount, MSG_LABEL, relativeCutoff, STATUS_LABEL, STATUS_TONE } from "@/lib/format";
import { REASON_CODES } from "@/lib/reference/codes";
import type { ParsedTransfer } from "@/lib/iso/parse";

const REASON = Object.fromEntries(REASON_CODES.map((c) => [c.code, c]));

export async function PaymentDrawer({ id, closeHref }: { id: string; closeHref: string }) {
  const row = await getPayment(id);
  const now = new Date();

  return (
    <div className="fixed inset-0 z-20 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <CloseOnEscape href={closeHref} />
      <Link href={closeHref} scroll={false} aria-label="Close payment details" className="absolute inset-0 bg-ink/30" />
      <aside className="drawer-in relative flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l border-rule bg-surface shadow-xl">
        {!row ? (
          <div className="p-6">
            <p className="font-semibold">Payment {id} was not found.</p>
            <p className="mt-1 text-sm text-muted">The demo data may have been reset. Close this panel and pick a payment from the list.</p>
          </div>
        ) : (
          <DrawerBody row={row} now={now} closeHref={closeHref} />
        )}
      </aside>
    </div>
  );
}

function DrawerBody({ row, now, closeHref }: { row: NonNullable<Awaited<ReturnType<typeof getPayment>>>; now: Date; closeHref: string }) {
  const p = row.payment;
  const parsed = p.parsed as ParsedTransfer;
  const reason = p.rejectReasonCode ? REASON[p.rejectReasonCode] : undefined;

  return (
    <>
      <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-rule bg-surface px-6 py-4">
        <div>
          <h2 id="drawer-title" className="font-mono text-xl font-bold">{p.id}</h2>
          <p className="text-sm text-muted">
            {MSG_LABEL[p.msgType]} ({p.msgType}) from {row.clientName}
          </p>
        </div>
        <Link href={closeHref} scroll={false} className="rounded-md border border-rule px-3 py-1.5 text-sm font-semibold hover:border-accent">
          Close
        </Link>
      </div>

      <div className="flex flex-col gap-6 px-6 py-5">
        {reason && (
          <section className="rounded-lg border-l-4 border-rejected bg-paper px-4 py-3">
            <h3 className="font-semibold text-rejected">
              Rejected by receiving bank: <span className="font-mono">{reason.code}</span> {reason.name}
            </h3>
            <p className="mt-1 text-sm">{reason.definition}</p>
          </section>
        )}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Field label="Status"><span className={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status] ?? p.status}</span></Field>
          <Field label="Amount">{formatAmount(p.amount)} {p.currency}</Field>
          <Field label="Corridor">{row.corridorLabel}</Field>
          <Field label="Debtor">{parsed.debtor?.name || <span className="text-review">Missing</span>}</Field>
          <Field label="Creditor">{parsed.creditor?.name || <span className="text-review">Missing</span>}</Field>
          <Field label="Cut-off">{relativeCutoff(p.cutoffAt, now)}</Field>
          <Field label="End-to-end reference"><span className="break-all font-mono text-xs">{p.endToEndId}</span></Field>
          <Field label="UETR"><span className="break-all font-mono text-xs">{p.uetr}</span></Field>
          <Field label="Batch"><span className="font-mono text-xs">{p.batchId}</span></Field>
        </dl>

        <p className="rounded-md bg-accent-soft px-3 py-2 text-sm">
          Checks run from Sprint 2. Until then this panel shows the raw message so you can read it as an analyst would.
        </p>

        <section>
          <h3 className="mb-2 font-semibold">Payment message</h3>
          <XmlView xml={p.rawXml} />
        </section>

        {p.rejectXml && (
          <section>
            <h3 className="mb-2 font-semibold">Rejection message (pacs.002)</h3>
            <XmlView xml={p.rejectXml} />
          </section>
        )}
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
