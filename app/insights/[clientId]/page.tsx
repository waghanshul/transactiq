import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BucketBadge } from "@/components/bucket-badge";
import { currentUser, DEMO_USERS } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { clientProblems } from "@/lib/data/insights";
import { suggestConfig } from "@/lib/suggest/config";
import { DraftButton, NoteEditor } from "./note-editor";

type Params = Promise<{ clientId: string }>;

export default function ClientNotePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading the client…</p>}>
      <Body params={params} />
    </Suspense>
  );
}

const who = (id?: string | null) => DEMO_USERS.find((u) => u.id === id)?.name ?? id;

async function Body({ params }: { params: Params }) {
  const { clientId } = await params;
  await connection();
  const db = getDb();
  const [p, user] = await Promise.all([clientProblems(db, clientId), currentUser(db)]);
  if (!p) return <p className="text-sm">Client not found. <Link href="/insights" className="text-accent underline">Back to Insights</Link></p>;
  const open = p.notes.filter((n) => !n.approvedBy).at(-1);
  const done = p.notes.filter((n) => n.approvedBy).reverse();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/insights" className="text-sm text-accent underline-offset-4 hover:underline">← Insights</Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Fix it at source: {p.client.name}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {p.affected} of {p.total} payments from this client had a problem in a beneficiary record. The same beneficiaries come up again and again:
          asking the client to fix those records once stops the errors coming back.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_28rem]">
        <section>
          <h2 className="text-lg font-bold">Beneficiary records to fix</h2>
          {p.beneficiaries.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No recurring problems for this client.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {p.beneficiaries.map((b) => (
                <li key={b.name} className="rounded-lg border border-rule bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{b.name}</span>
                    <span className="text-sm tabular-nums text-muted">{b.payments} {b.payments === 1 ? "payment" : "payments"}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">{b.buckets.map((x) => <BucketBadge key={x} bucket={x} />)}</div>
                  <p className="mt-1 text-sm text-muted">{b.example}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Note to the client</h2>
          <p className="text-sm text-muted">
            {suggestConfig.geminiEnabled
              ? "Gemini drafts from anonymised facts only (no names, accounts or amounts); names are filled in here. A maker edits, a different person approves and sends."
              : "Drafted from a template (add GEMINI_API_KEY for an AI draft). A maker edits, a different person approves and sends."}
          </p>
          {!user && <p className="text-sm"><Link href={`/sign-in?next=/insights/${clientId}`} className="font-semibold text-accent underline">Sign in</Link> to draft or approve.</p>}
          {open ? (
            <NoteEditor noteId={open.id} body={open.body} canEdit={user?.role === "maker"} canApprove={user?.role === "checker"} />
          ) : user?.role === "maker" && p.beneficiaries.length > 0 ? (
            <DraftButton clientId={clientId} label="Draft note" />
          ) : (
            <p className="text-sm text-muted">{user?.role === "checker" ? "No draft waiting for approval." : user ? "Only a maker can draft a note." : ""}</p>
          )}
          {done.length > 0 && (
            <div>
              <h3 className="mt-2 font-semibold">Approved notes</h3>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {done.map((n) => (
                  <li key={n.id}>
                    {n.createdAt.toISOString().slice(0, 10)}: approved by {who(n.approvedBy)}, {n.sentAt ? "emailed" : "not emailed (email not set up)"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
