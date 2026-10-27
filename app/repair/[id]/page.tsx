import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuditTrail } from "@/components/audit-trail";
import { BucketBadge } from "@/components/bucket-badge";
import { XmlDiff } from "@/components/xml-diff";
import { XmlView } from "@/components/xml-view";
import { currentUser, DEMO_USERS, type SessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { auditFor, loadFindings, loadRepairPayment, loadRepairState, loadSuggestions } from "@/lib/data/repair";
import { formatAmount, MSG_LABEL, relativeCutoff, STATUS_LABEL, STATUS_TONE } from "@/lib/format";
import { linesForPaths } from "@/lib/iso/highlight";
import type { ParsedTransfer } from "@/lib/iso/parse";
import { draftClientMessage, NEEDS_CLIENT } from "@/lib/repair/client-message";
import type { Change } from "@/lib/repair/workflow";
import { REJECT_EXPLANATION } from "@/lib/rules/engine";
import { suggestConfig } from "@/lib/suggest/config";
import { repairFieldFor } from "@/lib/suggest/engine";
import type { RepairField, RepairValue } from "@/lib/suggest/types";
import { CopyMessage, ViewLogger } from "./client-bits";
import { DecisionPanel } from "./decision-panel";
import { SuggestionCard } from "./suggestion-card";

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const EDITABLE = new Set(["flagged", "rejected", "in_repair"]);
const name = (id?: string | null) => DEMO_USERS.find((u) => u.id === id)?.name ?? id ?? "someone";

function currentValue(msg: ParsedTransfer, field: RepairField): RepairValue | undefined {
  switch (field) {
    case "Dbtr/Nm": return msg.debtor.name;
    case "Cdtr/Nm": return msg.creditor.name;
    case "Dbtr/PstlAdr": return msg.debtor.address;
    case "Cdtr/PstlAdr": return msg.creditor.address;
    case "CdtrAgt/FinInstnId/BICFI": return msg.creditorAgentBic;
    case "DbtrAgt/FinInstnId/BICFI": return msg.debtorAgentBic;
    case "Purp/Cd": return msg.purposeCode;
    case "PmtId/EndToEndId": return msg.endToEndId;
    case "ValueDate": return msg.valueDate;
  }
}

export default function RepairPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading the payment…</p>}>
      <Workbench params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Workbench({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const tab = (await searchParams).tab === "audit" ? "audit" : "repair";
  await connection();
  const db = getDb();
  const [row, user] = await Promise.all([loadRepairPayment(db, id), currentUser(db)]);
  if (!row) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold">Payment {id} was not found</h1>
        <p className="text-sm text-muted">The demo data may have been reset. <Link className="text-accent underline" href="/queue">Back to the queue</Link>.</p>
      </div>
    );
  }
  const p = row.payment;
  const msg = p.parsed as ParsedTransfer;
  const now = new Date();

  return (
    <div className="flex flex-col gap-5">
      <ViewLogger paymentId={p.id} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/queue" className="text-sm text-accent underline-offset-4 hover:underline">← Queue</Link>
          <h1 className="mt-1 flex flex-wrap items-baseline gap-x-3 text-2xl font-bold tracking-tight">
            <span className="font-mono">{p.id}</span>
            <span className={`text-base ${STATUS_TONE[p.status]}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
            {p.needsRescreen && (
              <span className="rounded border border-compliance px-2 py-0.5 text-xs font-semibold text-compliance" title="A name or address changed">
                Re-screen before release
              </span>
            )}
          </h1>
          <p className="text-sm text-muted">
            {MSG_LABEL[p.msgType]} ({p.msgType}) · {row.clientName} to {msg.creditor.name || "unnamed creditor"} ·{" "}
            {formatAmount(p.amount)} {p.currency} · {row.corridorLabel} · cut-off {relativeCutoff(p.cutoffAt, now)}
          </p>
        </div>
        {!user && (
          <Link href={`/sign-in?next=/repair/${p.id}`} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-surface">
            Sign in to repair
          </Link>
        )}
      </div>

      <nav aria-label="Payment" className="flex gap-1 border-b border-rule">
        <TabLink href={`/repair/${p.id}`} active={tab === "repair"}>Repair</TabLink>
        <TabLink href={`/repair/${p.id}?tab=audit`} active={tab === "audit"}>Audit trail</TabLink>
      </nav>

      {tab === "audit" ? (
        <Suspense fallback={<p className="text-sm text-muted">Loading the audit trail…</p>}>
          <Audit id={p.id} />
        </Suspense>
      ) : (
        <RepairTab row={row} user={user} />
      )}
    </div>
  );
}

async function Audit({ id }: { id: string }) {
  return <AuditTrail entries={await auditFor(getDb(), id)} />;
}

type Row = NonNullable<Awaited<ReturnType<typeof loadRepairPayment>>>;

async function RepairTab({ row, user }: { row: Row; user?: SessionUser }) {
  const db = getDb();
  const p = row.payment;
  const msg = p.parsed as ParsedTransfer;
  const [findings, state] = await Promise.all([loadFindings(db, p.id), loadRepairState(db, p.id)]);
  const open = state.open;
  const editable = EDITABLE.has(p.status) && (!open || open.state === "draft");
  const isMaker = user?.role === "maker";
  const isChecker = user?.role === "checker";
  const checkerIsEditor = !!open && !!user && (open.makerId === user.id || open.diff.editors.includes(user.id));

  // Group findings by the field a repair changes.
  const fields = new Map<RepairField, string[]>();
  const other: typeof findings = [];
  for (const f of findings) {
    const field = repairFieldFor({ ruleId: f.ruleId, fieldPath: f.xpath ?? "" });
    if (field) fields.set(field, [...(fields.get(field) ?? []), f.message]);
    else other.push(f);
  }
  const clientProblems = [
    ...other.filter((f) => NEEDS_CLIENT.has(f.ruleId)).map((f) => f.ruleId),
    ...(p.rejectReasonCode && NEEDS_CLIENT.has(p.rejectReasonCode) && !findings.length ? [p.rejectReasonCode] : []),
  ];
  const desk = other.filter((f) => f.ruleId.startsWith("AMT-"));
  const reject = p.rejectReasonCode ? REJECT_EXPLANATION[p.rejectReasonCode] : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex min-w-0 flex-col gap-5">
        {reject && (
          <section className="rounded-lg border-l-4 border-rejected bg-surface px-4 py-3">
            <h2 className="font-semibold text-rejected">Rejected by the receiving bank: <span className="font-mono">{p.rejectReasonCode}</span></h2>
            <p className="mt-1 text-sm">{reject.text}</p>
          </section>
        )}
        <StatusNote status={p.status} />

        {fields.size > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">Fixes</h2>
            <Suspense fallback={<p className="rounded-lg border border-rule bg-surface px-4 py-3 text-sm text-muted">Checking the suggested towns with OpenStreetMap…</p>}>
              <Fixes
                paymentId={p.id} status={p.status} msg={msg} fields={fields}
                changes={open?.diff.changes ?? []} dismissed={open?.diff.dismissed ?? []}
                canEdit={editable && isMaker}
              />
            </Suspense>
          </section>
        )}

        {clientProblems.length > 0 && (
          <section className="rounded-lg border border-rule bg-surface px-4 py-3">
            <h2 className="font-semibold">Ask the client: the tool never guesses accounts or amounts</h2>
            <ClientMessage row={row} problems={clientProblems} canLog={isMaker} />
          </section>
        )}
        {desk.length > 0 && (
          <section className="rounded-lg border border-rule bg-surface px-4 py-3">
            <h2 className="font-semibold">Route to the payments desk</h2>
            <ul className="mt-1 list-disc pl-5 text-sm">{desk.map((f) => <li key={f.id}>{f.message}</li>)}</ul>
            <p className="mt-1 text-sm text-muted">Amounts and currencies are never changed here; the desk decides with the client.</p>
          </section>
        )}

        {(open?.diff.changes.length || state.last?.state === "approved") ? (
          <section>
            <h2 className="mb-2 text-lg font-bold">{state.last?.state === "approved" && !open ? "What was changed" : "Changes in this repair"}</h2>
            <XmlDiff
              before={(open ?? state.last)!.diff.beforeXml ?? (state.last?.state === "approved" ? state.last.diff.beforeXml ?? p.rawXml : p.rawXml)}
              after={open ? state.preview?.afterXml ?? p.rawXml : p.rawXml}
            />
          </section>
        ) : null}

        <details className="rounded-lg border border-rule bg-surface px-4 py-3">
          <summary className="cursor-pointer font-semibold">Payment message{findings.length ? " (problem lines highlighted)" : ""}</summary>
          <div className="mt-3">
            <XmlView xml={p.rawXml} highlightLines={linesForPaths(p.rawXml, findings.map((f) => f.xpath ?? ""))} />
          </div>
          {p.rejectXml && (
            <div className="mt-3">
              <h3 className="mb-1 text-sm font-semibold">Rejection message (pacs.002)</h3>
              <XmlView xml={p.rejectXml} />
            </div>
          )}
        </details>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        <section className="rounded-lg border border-rule bg-surface px-4 py-4">
          <h2 className="font-semibold">Repair</h2>
          <RepairSummary status={p.status} open={open} last={state.last} preview={state.preview} />
          <div className="mt-3">
            {isMaker && editable && open && open.diff.changes.length > 0 ? (
              <DecisionPanel paymentId={p.id} mode={{ kind: "submit", ready: !!state.preview && state.preview.findings.length === 0, changes: open.diff.changes.length }} />
            ) : isChecker && p.status === "pending_check" && !checkerIsEditor ? (
              <DecisionPanel paymentId={p.id} mode={{ kind: "decide" }} />
            ) : (
              <p className="text-sm text-muted">{nextStepFor(p.status, user, checkerIsEditor, open?.diff.changes.length ?? 0, fields.size > 0)}</p>
            )}
          </div>
        </section>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-rule bg-surface px-4 py-3 text-sm">
          <Item label="Debtor">{msg.debtor.name || "Missing"}</Item>
          <Item label="Creditor">{msg.creditor.name || "Missing"}</Item>
          <Item label="Amount">{formatAmount(p.amount)} {p.currency}</Item>
          <Item label="Reference"><span className="break-all font-mono text-xs">{msg.endToEndId}</span></Item>
        </dl>
        {findings.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {findings.map((f) => (
              <li key={f.id} className="flex items-start gap-2"><BucketBadge bucket={f.bucket} /><span className="font-mono text-xs leading-5 text-muted">{f.ruleId}</span></li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

async function Fixes({ paymentId, status, msg, fields, changes, dismissed, canEdit }: {
  paymentId: string; status: string; msg: ParsedTransfer; fields: Map<RepairField, string[]>;
  changes: Change[]; dismissed: number[]; canEdit: boolean;
}) {
  const suggestions = await loadSuggestions(getDb(), paymentId, status);
  return (
    <>
      {[...fields.entries()].map(([field, problems]) => {
        const s = suggestions.find((x) => x.fieldPath === field);
        const change = changes.find((c) => c.fieldPath === field);
        return (
          <SuggestionCard
            key={field}
            paymentId={paymentId}
            fieldPath={field}
            current={currentValue(msg, field)}
            problems={problems}
            suggestion={s ? { ...s } : undefined}
            change={change ? { newValue: change.newValue, how: change.how, by: change.by } : undefined}
            dismissed={!!s && dismissed.includes(s.id)}
            canEdit={canEdit}
            threshold={suggestConfig.minConfidence}
          />
        );
      })}
    </>
  );
}

function ClientMessage({ row, problems, canLog }: { row: Row; problems: string[]; canLog: boolean }) {
  const msg = row.payment.parsed as ParsedTransfer;
  const m = draftClientMessage({
    clientName: row.clientName, paymentId: row.payment.id, endToEndId: msg.endToEndId, amount: formatAmount(row.payment.amount),
    currency: row.payment.currency, creditorName: msg.creditor.name, problems,
  });
  const text = `Subject: ${m.subject}\n\n${m.body}`;
  return (
    <div className="mt-2 flex flex-col gap-2">
      <pre className="whitespace-pre-wrap rounded-md bg-paper px-3 py-2 font-sans text-sm">{text}</pre>
      <CopyMessage paymentId={row.payment.id} text={text} canLog={canLog} />
    </div>
  );
}

function StatusNote({ status }: { status: string }) {
  const note: Record<string, string> = {
    compliance: "This payment matched a name on the screening list and is with compliance. Nothing can be changed or suggested here.",
    held: "Held as a possible duplicate. Confirm with the client whether both payments are intended; the tool does not release or cancel it.",
    ready: "This payment passed every check. Nothing to repair.",
    new: "This payment hasn't been checked yet. Run the checks from the Queue.",
    approved: "Repair approved. The corrected message is ready to send.",
  };
  return note[status] ? <p className="rounded-lg border border-rule bg-surface px-4 py-3 text-sm">{note[status]}</p> : null;
}

function RepairSummary({ status, open, last, preview }: {
  status: string;
  open?: Awaited<ReturnType<typeof loadRepairState>>["open"];
  last?: Awaited<ReturnType<typeof loadRepairState>>["last"];
  preview?: Awaited<ReturnType<typeof loadRepairState>>["preview"];
}) {
  const sentBack = open?.state === "draft" && open.comment;
  return (
    <div className="mt-2 flex flex-col gap-2 text-sm">
      {open ? (
        <p>
          {open.state === "submitted" ? `Submitted by ${name(open.makerId)}.` : `Draft by ${open.diff.editors.map(name).join(", ") || name(open.makerId)}.`}{" "}
          {open.diff.changes.length} {open.diff.changes.length === 1 ? "change" : "changes"}.
        </p>
      ) : last?.state === "approved" ? (
        <p>Made by {name(last.makerId)}, approved by {name(last.checkerId)}{last.comment ? `: “${last.comment}”` : "."}</p>
      ) : (
        <p className="text-muted">{EDITABLE.has(status) ? "No repair started." : "No repair."}</p>
      )}
      {sentBack && <p className="rounded-md border-l-4 border-review bg-paper px-3 py-2">Sent back by the checker: “{open!.comment}”</p>}
      {preview && (
        preview.findings.length === 0 ? (
          <p className="text-clean">All 22 checks pass on the repaired message.</p>
        ) : (
          <div className="text-rejected">
            <p className="font-semibold">{preview.introduced.length ? "The repair introduces a problem:" : "Still to fix:"}</p>
            <ul className="mt-1 list-disc pl-5">{preview.findings.map((f, i) => <li key={i}>{f.message}</li>)}</ul>
          </div>
        )
      )}
    </div>
  );
}

function nextStepFor(status: string, user: SessionUser | undefined, isEditor: boolean, changes: number, fixable: boolean): string {
  if (!user) return fixable || status === "pending_check" ? "Sign in as a maker to repair, or as a checker to approve." : "No fix possible in the tool.";
  if (status === "pending_check") {
    if (user.role === "checker" && isEditor) return "You worked on this repair, so a different checker must approve it.";
    return user.role === "checker" ? "" : "Waiting for a checker. Switch to the checker to approve.";
  }
  if (EDITABLE.has(status)) {
    if (!fixable) return "Nothing here can be fixed in the tool. It waits for the client's answer.";
    if (user.role !== "maker") return "Only a maker can change a payment. Switch user to repair it.";
    return changes ? "" : "Accept or type a fix above to start the repair.";
  }
  return "No action needed.";
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}>
      {children}
    </Link>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
