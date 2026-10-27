# Repair Desk: payment repair POC

@AGENTS.md

## What this is
A demo that checks ISO 20022 payments (pacs.008, pain.001) before sending, explains
errors, suggests fixes, and runs maker-checker repair on payments rejected with a
pacs.002. Built as a POC for a bank's payments operations team. SYNTHETIC DATA ONLY.

## Stack
Next.js 16 App Router (Cache Components on) + TypeScript, Tailwind v4, Drizzle ORM +
Neon Postgres (`@neondatabase/serverless` HTTP driver; node-postgres for local URLs),
Neon Auth (Sprint 3), Vercel AI SDK + Gemini Flash (Sprint 3), vitest. Deployed on
Vercel Hobby. Fonts are self-hosted from @fontsource (no Google Fonts at runtime).

## Next.js 16 gotchas (read before writing pages)
- Cache Components is on: DB queries and `searchParams` must run inside a `<Suspense>`
  boundary. Pass the `searchParams` promise into the suspended child and await it there.
- `new Date()` / `Date.now()` in a server component needs `await connection()` first
  (or an earlier request-time await), otherwise the build fails.
- Read `node_modules/next/dist/docs/` when unsure; APIs differ from older Next.js.

## Layout
- `lib/iso/`: build, parse and charset helpers for ISO 20022 XML.
- `lib/reference/`: buckets (failure taxonomy), ISO code sets, corridors, synthetic banks, watchlist.
- `lib/synth/`: deterministic synthetic data generator and answer key.
- `lib/db/`: Drizzle schema and client. `lib/seed/`: seed/reset. `lib/data/`: page queries.
- `lib/rules/` (Sprint 2): one rule per file, pure functions, each with a vitest fixture.
- `lib/suggest/` (Sprint 3): every suggestion returns {fieldPath, newValue, source, confidence, reason}.
- API routes stay thin; logic lives in `lib/`.

## Guardrails (never break these)
- Never suggest changes to account numbers, amounts or currencies.
- Payments with status `compliance` are never modified or suggested on.
- Maker and checker must be different users; enforce in the API, not just the UI.
- Every state change writes to `audit_log`.
- Never send real personal or client data to Gemini or any external API.
- The answer key is ground truth for metrics; never read it inside rules or suggestions.

## Free-tier hygiene
- Validate in chunks of 50; cache LLM and Nominatim results in `api_cache`.
- Nominatim: max 1 request/second, identifying User-Agent, OSM attribution.
- Neon free: 0.5 GB. Import only corridor-country BICs and entity names.

## Commands
`npm run dev` · `npm test` · `npm run lint` · `npm run typecheck` · `npm run build`
`npm run db:generate` (after schema changes) · `npm run db:migrate` · `npm run seed`
`npm run synth` (write sample XML to data/synthetic/) · `npm run baseline:sheet`

## Definition of done
Tests, lint and typecheck pass; preview deploy works; the task's "done when" is met;
any non-obvious choice is logged in DECISIONS.md.
