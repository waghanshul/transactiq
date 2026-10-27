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
