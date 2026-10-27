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

## Sprint 3

**Demo sign-in instead of Neon Auth (S3-09).** Four fictitious users (two makers, a
checker, a viewer) sign in with one click, so a presenter can play both sides of
maker-checker in seconds during a demo. The session is an HMAC-signed, http-only
cookie (AUTH_SECRET, or RESET_SECRET as a fallback). The role always comes from the
`user_roles` table and every server action checks it again, so the security model is
the same as with a real identity provider: swapping in Neon Auth only changes how
`currentUser()` gets the user id. Neon Auth also needs console setup the user would
have to do by hand, and can't be tested from the build environment.

**Maker-checker is enforced in `lib/repair/workflow.ts`, not the UI.** A checker is
refused if they are the submitting maker or edited the repair at any point
(`diff.editors`). Sending back needs a comment. Approval re-runs every rule before the
payment changes. Covered by `tests/workflow.test.ts` against a real Postgres (skipped
in CI, which has no database).

**Suggestions are computed in the batch check, without network calls.** All 101
suggestions take well under a second and are stored with the findings. The
OpenStreetMap check and the Gemini fallback run only when a repair is opened, once per
suggestion, and the result is stored (`enhanced`) and cached in `api_cache`.

**The address engine reads the text first; bank records only confirm.** v1 finds town
and country from the free text (gazetteer, postcode shapes, Japanese wards and postcode
ranges, India PIN prefixes, country names and aliases). The client or beneficiary
record on file then raises confidence when it agrees and lowers it when it doesn't. A
town inferred only from a postcode stays below the display threshold (Thane shares PIN
prefix 400 with Mumbai), so the analyst sees options, not a confident wrong answer.

**Town list is a curated GeoNames subset.** GeoNames downloads are blocked from the
build environment, so `lib/reference/towns.ts` holds ~70 towns in the corridor
countries, plus historic names (Bombay, Madras, Munich). Swap in cities15000 for
production.

**150-address test set (S3-02).** `lib/synth/address-testset.ts` is deliberately
messier than the seeded payments: old names, typos, capitals, one-line, missing
country, Japanese block addresses and 10 real towns not in the list. Rules only: 126
shown, all right; 24 "not sure", which is where Gemini is asked. It is still synthetic,
so the number says the engine behaves as designed, not that it would score the same on
a bank's real addresses.

**Gemini sees only free-text address lines.** No names, accounts, amounts or
references. A 429 or any other failure shows "Suggestion unavailable" and the page
carries on. An LLM answer alone is capped at 80% confidence; 90% only when it agrees
with the rules. Model is `gemini-flash-latest` (GEMINI_MODEL to change).

**No migration for Sprint 3.** The `suggestions` table keeps the contract fields in
columns; options, cross-check notes and resolved rules ride inside the `new_value`
JSON. The deployed database needs no re-setup.

**XML is edited in place, not rebuilt.** `lib/iso/edit.ts` replaces only the changed
element's lines, so the diff shows exactly the repair and nothing else moves.

**End-to-end references are matched to the client's own format.** Cutting a long
reference to 35 characters can leave a value the client never issued. The suggestion
picks the longest prefix with the same shape as the client's other references
(`AAAA-AAA-999999`); without a match, it falls below the threshold.

**ADDR-HYBRID-DUPLICATE tightened.** It now flags only a line part that is just the
town (with or without a postcode). Street names that contain the town ("Dubai Silicon
Oasis", "Mumbai-Pune Highway") are legitimate and were blocking valid repairs.

**Benchmark against Swift's address model and other open-source tools (S3-16) is not
run.** They need Python packages and downloads that the build environment can't
reach. The Metrics table keeps a row for them so the comparison stays honest about
what was and wasn't measured.

**Held duplicates and amount/currency problems have no repair path.** The tool says
what to do (confirm with the client, route to the desk) but never releases, cancels or
edits them.
