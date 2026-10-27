import Link from "next/link";

export const metadata = { title: "About – TransactIQ" };

const CONTROLS = [
  { title: "Money fields are never touched", body: "Accounts, amounts and currencies are never suggested and never edited. Account problems get a drafted message asking the client; amount problems go to the payments desk." },
  { title: "Screening stays with compliance", body: "A name close to the watchlist sends the payment to compliance. Nothing is suggested or changed on it, and any change to a name or address raises a re-screen flag." },
  { title: "Maker-checker, enforced on the server", body: "A maker repairs, a different checker approves. Anyone who edited a repair can't approve it, whatever the screen shows; the check runs in every server action." },
  { title: "Every change is re-checked", body: "All 22 rules run again on the repaired message before it can be submitted and again before approval. A repair that adds a new error is blocked." },
  { title: "Thresholds, sources and an audit trail", body: "Each suggestion shows its confidence, source and reason; below the threshold the analyst gets options, not a guess. Every view, suggestion, edit and decision is logged." },
];

export default function AboutPage() {
  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">How TransactIQ works</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          A proof of concept for a bank&rsquo;s payments operations team. It checks ISO 20022 payments (pacs.008 and pain.001)
          before they are sent, explains each problem in plain words, suggests a fix, and runs maker-checker repair, including
          for payments already rejected with a pacs.002. Rules decide, AI only suggests when the rules are unsure, and people approve.
        </p>
        <p className="mt-2 rounded-md border-l-4 border-review bg-surface px-3 py-2 text-sm">
          Every client, bank, account and payment here is synthetic. Not for production use.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-bold">Architecture</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-rule bg-surface p-3">
          <Diagram />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold">Five controls</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2">
          {CONTROLS.map((c, i) => (
            <li key={c.title} className="rounded-lg border border-rule bg-surface px-4 py-3">
              <p className="font-semibold"><span className="mr-2 text-accent">{i + 1}</span>{c.title}</p>
              <p className="mt-1 text-sm text-muted">{c.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <h2 className="text-lg font-bold">What is measured</h2>
          <p className="mt-1 text-muted">
            Every error in the data was seeded on purpose and written to an answer key. The rules and suggestions never read it;
            the <Link href="/metrics" className="text-accent underline">Metrics</Link> page uses it afterwards to score them. Because
            the data is synthetic, the scores show the tool behaves as designed, not how it would score on a bank&rsquo;s real payments.
            That needs a pilot on anonymised rejects.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-bold">Built with free tiers</h2>
          <p className="mt-1 text-muted">
            Next.js on Vercel Hobby, Neon Postgres (free), Gemini Flash (free tier, optional), OpenStreetMap Nominatim (one
            request a second, cached), Resend (optional). Source on{" "}
            <a href="https://github.com/waghanshul/transactiq" className="text-accent underline">GitHub</a>.
            <span className="mt-2 block">
              <Link href="/business-case" className="text-accent underline">Business-case calculator</Link> ·{" "}
              <Link href="/setup" className="text-accent underline">Reset the demo data</Link> (needs the reset secret)
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}

function Box({ x, y, w, h, title, lines = [], strong }: { x: number; y: number; w: number; h: number; title: string; lines?: string[]; strong?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} className={strong ? "fill-accent-soft stroke-accent" : "fill-surface stroke-rule"} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + 24} textAnchor="middle" className="fill-ink text-[14px] font-semibold">{title}</text>
      {lines.map((l, i) => (
        <text key={l} x={x + w / 2} y={y + 44 + i * 18} textAnchor="middle" className="fill-muted text-[12px]">{l}</text>
      ))}
    </g>
  );
}

function Arrow({ d, dashed, label, lx, ly }: { d: string; dashed?: boolean; label?: string; lx?: number; ly?: number }) {
  return (
    <g>
      <path d={d} fill="none" className="stroke-muted" strokeWidth={1.5} strokeDasharray={dashed ? "5 4" : undefined} markerEnd="url(#arrow)" />
      {label && <text x={lx} y={ly} textAnchor="middle" className="fill-muted text-[11px]">{label}</text>}
    </g>
  );
}

function Diagram() {
  return (
    <svg viewBox="0 0 960 470" role="img" aria-labelledby="arch-title arch-desc" className="h-auto w-full min-w-[720px]">
      <title id="arch-title">TransactIQ architecture</title>
      <desc id="arch-desc">
        Makers, checkers and viewers use the web pages. Server actions check roles and guardrails, then call the rule engine,
        the suggestion engine and the repair workflow, which store everything in Neon Postgres. Optional external services:
        OpenStreetMap receives a town and country, Gemini receives address lines or anonymised facts, Resend sends an approved note.
      </desc>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="fill-muted" />
        </marker>
      </defs>

      <Box x={20} y={60} w={170} h={200} title="People" lines={["Maker: repairs", "Checker: approves", "Viewer: reads", "", "Demo sign-in;", "role from database"]} />

      <rect x={240} y={20} width={470} height={330} rx={12} className="fill-paper stroke-rule" strokeWidth={1.5} strokeDasharray="6 4" />
      <text x={475} y={44} textAnchor="middle" className="fill-muted text-[12px] font-semibold">TransactIQ on Vercel (Next.js): rules decide, AI only suggests, people approve</text>
      <Box x={260} y={56} w={430} h={58} title="Pages" lines={["Queue · Repair workbench · Insights · Metrics"]} />
      <Box x={260} y={130} w={430} h={58} title="Server actions" lines={["role check · guardrails · audit on every change"]} strong />
      <Box x={260} y={206} w={135} h={84} title="Rule engine" lines={["22 rules, pure", "no AI"]} />
      <Box x={407} y={206} w={135} h={84} title="Suggestions" lines={["rules, records,", "history; AI fallback"]} />
      <Box x={555} y={206} w={135} h={84} title="Repair workflow" lines={["maker-checker,", "re-validation"]} />

      <Box x={770} y={60} w={170} h={230} title="Neon Postgres" lines={["payments, XML", "findings", "suggestions", "repairs", "audit log", "answer key", "(metrics only)"]} />

      <Box x={240} y={390} w={150} h={64} title="OpenStreetMap" lines={["town + country only"]} />
      <Box x={405} y={390} w={150} h={64} title="Gemini Flash" lines={["optional fallback"]} />
      <Box x={570} y={390} w={140} h={64} title="Resend" lines={["optional email"]} />

      <Arrow d="M190 160 L256 85" />
      <Arrow d="M475 114 L475 126" />
      <Arrow d="M475 188 L475 202" />
      <Arrow d="M690 160 L766 160" label="read/write" lx={728} ly={150} />
      <Arrow d="M450 290 L320 386" dashed label="town, country" lx={318} ly={352} />
      <Arrow d="M475 290 L480 386" dashed label="address lines or" lx={530} ly={358} />
      <text x={530} y={372} textAnchor="middle" className="fill-muted text-[11px]">anonymised facts</text>
      <Arrow d="M622 290 L640 386" dashed label="approved note" lx={672} ly={345} />
    </svg>
  );
}
