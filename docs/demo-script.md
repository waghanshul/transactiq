# Demo script (7 minutes)

Before you start: open `/api/health` (wakes the database), then `/setup` and reset the demo
data so every ID below matches. Have two tabs ready if you like: one signed in as the maker,
one as the checker. Payment IDs are stable across resets because the data is generated from
a fixed seed.

## 1. The cliff (30 s)
**Queue.** "From 14 November, Swift rejects payments whose addresses are free text. This is
today's batch: 300 outgoing payments and 40 that already came back rejected."
Click **Run pre-send checks**. "207 pass; 93 would have failed after sending. Now they're
caught before they leave."

## 2. Easy win (60 s)
Sign in as **Asha (Maker)**. Open **PRV-0014** (Pune supplier, free-text address).
"The tool explains the problem in one sentence and suggests town Pune, country IN, postcode
in its own field. 97% confident, and it says why: the text, the town list, and the
beneficiary record agree." Click **Accept**. "Every rule re-runs: all 22 pass." **Submit**.

## 3. Honest hard case (60 s)
Open **PRV-0123**: a Japanese block address with no town, to a first-time beneficiary.
"Naka-ku is a ward in four cities and there's no record to confirm. So no guess: it shows
options." Pick one or click **Fill in by hand**. "Thresholds are the point: an analyst
stops trusting a tool the first time it's confidently wrong."

## 4. Never guess money (45 s)
Open **PRV-0033** (IBAN fails its checksum). "The tool will never suggest an account number
or an amount. It drafts the message to the client instead."

## 5. Duplicates and sanctions (45 s)
Back on the Queue, filter **Possible duplicate** and **Possible sanctions match**. "Likely
duplicates are held for confirmation. A name close to the watchlist goes to compliance;
the tool doesn't touch it."

## 6. Maker-checker and audit (60 s)
Click **Switch**, sign in as **Kenji (Checker)**. Queue tab **Waiting for approval**, open
PRV-0014. "The checker sees exactly what changed in the XML and that every rule passes."
**Approve**. Open **Audit trail**: "Who saw it, what was suggested, what was accepted, who
approved. And Asha could not have approved her own repair; the server refuses it."

## 7. Fix it at source, and the numbers (90 s)
**Insights.** "Kaze Trading's host-to-host files fail 60% of the time, mostly addresses.
Rather than fixing them every day, ask Kaze to fix the records once." Open **Note to
client** (as a maker it drafts; a checker approves and sends).
**Metrics.** "Scored against an answer key the rules never see. Every guardrail at zero."
Close: "This runs on synthetic data. With two weeks of anonymised reject data, we can
measure it for real."
