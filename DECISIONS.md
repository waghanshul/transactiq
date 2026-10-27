# Decisions log

Short notes on non-obvious choices. Newest first.

## Sprint 1

**Browser setup page instead of a terminal.** `/setup` runs the SQL migrations and the seed
from a server action, guarded by `RESET_SECRET` with a timing-safe compare. The project can
be deployed and loaded without installing Node locally. The migration files ship with that
route via `outputFileTracingIncludes`.

**TypeScript generator instead of Faker.** Supplier names, streets and towns come from
hand-curated lists in `lib/synth/`. Every value stays inside the CBPR+ Latin character
set and the dataset is byte-identical on every seed, which the tests check.

**All BICs are fictitious test BICs.** Every bank in `lib/reference/banks.ts` has "0" as
the 8th character, which the BIC standard reserves for test and training codes, so none
can match a live bank. `npm run import:gleif` can add real BICs from GLEIF's free file.

**Synthetic watchlist.** The screening stub ships with invented names so the demo never
implies a real company is sanctioned. `npm run import:sdn` loads the public OFAC SDN list.

**Errors are seeded with an answer key.** 93 of 300 Prevent messages (31%) and all 40
Repair items carry one known error. The answer key records bucket, expected reason code,
the correct fix, whether it is auto-suggestable, and whether it is even visible before
sending (closed accounts are not). Metrics in Sprint 4 are computed against it.

**Kaze Trading gets ~40% of address errors.** Its address-error bias is set so one client
dominates bucket 1. That gives the Insights page a real "fix it at source" story.

**Scarce buckets are seeded first.** Purpose-code errors only fit corridors that need a
purpose; seeding them before the always-eligible address errors avoids running out.

**Repair items keep the original pacs.008 plus its pacs.002.** One row per payment to
repair, with `reject_xml` and `reject_reason_code` alongside the original message.

**Reject reason codes for unstructured addresses use RR02/RR03.** After 14 Nov 2026 the
Swift network itself refuses unstructured addresses; a downstream pacs.002 with
RR02/RR03 is a stand-in. Confirm real codes with the bank's own pacs.002 data.

**No AppHdr (head.001).** CBPR+ messages travel with a Business Application Header. The
POC omits it to keep messages readable; it doesn't affect the checks being demonstrated.

**XSD files are not committed yet.** iso20022.org isn't reachable from the build sandbox.
Download them per `schemas/README.md`; schema validation lands in Sprint 2 (S2-02).

**Two database drivers.** Neon URLs use the HTTP driver (good for Vercel serverless);
any other Postgres URL uses node-postgres, so tests and local dev can use a local DB.

**Self-hosted fonts.** Atkinson Hyperlegible Next and Mono via @fontsource: built for
legibility of similar characters (0/O, 1/l/I), which matters when reading account
numbers and references all day. No runtime call to Google Fonts.

**Filters live in the URL.** The payments list is a plain GET form, so a filtered view
can be shared or bookmarked and the back button works.

## Sprint 2

**One file per failure bucket, not one file per rule.** 22 rules in 9 files
(`lib/rules/address.ts` etc.). Rules in a bucket share helpers and a source citation, and
22 tiny files made the code harder to read. Each rule is still a separate pure function
with its own id, title, source and a vitest fixture in `tests/rules.test.ts`.
`docs/rule-catalogue.md` is generated from the rule metadata (`npm run rules:catalogue`).

**XSD validation deferred.** The ISO 20022 schema files can't be downloaded from this
build environment (iso20022.org is blocked). The format rules (charset, reference length,
date, decimals) cover the seeded schema errors in bucket 6. XSD can be added later by
dropping the .xsd files into `schemas/` and validating with libxmljs2 in a route.

**Status flow after a check.** Outgoing payments move from `new` to one of `ready`
(no findings), `flagged` (needs repair), `held` (possible duplicate; the earlier payment
is released, the later one held) or `compliance` (any screening hit, which stops every
other check so nobody "fixes" a payment under review). Re-running checks only touches
those five statuses, so payments in the Sprint 3 repair workflow are never reset.

**Rejects are explained from the reason code first, rules second.** A pacs.002 code like
RR03 is ambiguous across buckets 1 and 2. If a rule finding on the rejected message
carries the same code, its bucket wins; otherwise the code's default bucket is used. 3
of 40 rejects (for example AC04, account closed) have nothing in the message that could
have shown the problem; the queue says so and the metrics page counts them separately.

**Metrics read the answer key only after the rules run.** `lib/data/metrics.ts` and
`lib/rules/evaluate.ts` are the only readers, and both work on stored results.
