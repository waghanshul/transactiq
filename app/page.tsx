import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { overview } from "@/lib/data/payments";

export default function Home() {
  return (
    <div className="flex max-w-3xl flex-col gap-8 py-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Catch broken cross-border payments before they leave the bank.
        </h1>
        <p className="mt-3 text-base text-muted">
          From 14 November 2026, Swift rejects payments whose addresses are free text. TransactIQ checks ISO 20022
          messages before sending, explains each problem in plain words, suggests a fix, and sends every change
          through maker-checker approval.
        </p>
      </div>

      <Suspense fallback={<p className="text-sm text-muted">Loading today’s work…</p>}>
        <Today />
      </Suspense>

      <section className="border-t border-rule pt-6">
        <h2 className="text-lg font-bold">How the demo is built</h2>
        <ol className="mt-3 flex flex-col gap-3 text-sm">
          <Step n={1} done title="Foundation">300 synthetic payments and 40 rejects, seeded with known errors and an answer key.</Step>
          <Step n={2} done title="Check before sending">22 deterministic CBPR+ rules find every seeded error and explain each reject. <Link href="/queue" className="font-semibold text-accent underline-offset-4 hover:underline">Open the queue</Link>.</Step>
          <Step n={3} done title="Repair with approval">Suggested fixes with confidence and source, maker-checker sign-off enforced on the server, and a full audit trail. <Link href="/sign-in" className="font-semibold text-accent underline-offset-4 hover:underline">Sign in as a demo user</Link>.</Step>
          <Step n={4} title="Fix it at source">Insights on repeat errors, a drafted note to the client, and measured results.</Step>
        </ol>
      </section>
    </div>
  );
}

async function Today() {
  await connection();
  let data: Awaited<ReturnType<typeof overview>>;
  try {
    data = await overview(new Date());
  } catch {
    return (
      <p className="rounded-md border border-rule bg-surface px-4 py-3 text-sm">
        The demo data isn’t loaded yet.{" "}
        <Link href="/setup" className="font-semibold text-accent underline-offset-4 hover:underline">Set up the demo</Link>{" "}
        to create the tables and load the synthetic payments.
      </p>
    );
  }
  const total = (mode: string) => data.byMode.filter((r) => r.mode === mode).reduce((s, r) => s + r.n, 0);
  const prevent = total("prevent");
  const repair = total("repair");
  if (prevent + repair === 0) {
    return (
      <p className="rounded-md border border-rule bg-surface px-4 py-3 text-sm">
        No payments loaded.{" "}
        <Link href="/setup" className="font-semibold text-accent underline-offset-4 hover:underline">Set up the demo</Link>{" "}
        to load the synthetic dataset.
      </p>
    );
  }

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <Link href="/payments?mode=prevent" className="rounded-lg border border-rule bg-surface p-5 hover:border-accent">
        <span className="block text-4xl font-bold">{prevent}</span>
        <span className="mt-1 block font-semibold">Messages to check before sending</span>
        <span className="mt-1 block text-sm text-muted">Client instructions and bank-to-bank transfers in today’s batches.</span>
      </Link>
      <Link href="/payments?mode=repair" className="rounded-lg border border-rule bg-surface p-5 hover:border-accent">
        <span className="block text-4xl font-bold text-rejected">{repair}</span>
        <span className="mt-1 block font-semibold">Payments rejected after sending</span>
        <span className="mt-1 block text-sm text-muted">Returned by the receiving bank with a reason code; each needs a repair.</span>
      </Link>
    </section>
  );
}

function Step({ n, title, done = false, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-accent text-surface" : "border border-rule text-muted"}`}>
        {n}
      </span>
      <span>
        <span className="font-semibold">{title}{done ? " (live)" : ""}</span>
        <span className="block text-muted">{children}</span>
      </span>
    </li>
  );
}
