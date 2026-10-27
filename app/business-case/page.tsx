import { Calculator } from "./calculator";

export default function BusinessCasePage() {
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="flex flex-wrap items-baseline gap-3 text-2xl font-bold tracking-tight">
          Plug in your numbers
          <span className="rounded border border-review px-2 py-0.5 text-xs font-semibold text-review">Assumptions, not Mizuho data</span>
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Annual saving = E × C × (p + (1 − p) × r) × D. The defaults are an illustrative scenario built on the LexisNexis
          &ldquo;typical bank&rdquo;: about 10,000 cross-border payments a day at 95% straight-through processing, so 500
          exceptions, at an average $12.10 each (LexisNexis Risk Solutions, True Impact of Failed Payments, Oct 2026).
          The prevention and effort shares are assumptions to replace with a pilot&rsquo;s measured values.
        </p>
      </div>
      <Calculator />
      <section className="max-w-3xl text-sm">
        <h2 className="text-lg font-bold">Not in the number</h2>
        <ul className="mt-2 list-disc pl-5 text-muted">
          <li>Rejects avoided after 14 November 2026, when Swift stops accepting free-text-only addresses.</li>
          <li>Client retention: in the same study, a third of banks say failed payments cost them 2–5% of customers.</li>
          <li>Analyst time freed for higher-value work rather than rework.</li>
        </ul>
      </section>
    </div>
  );
}
