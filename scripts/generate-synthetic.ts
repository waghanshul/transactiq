// npm run synth: writes the synthetic dataset to data/synthetic/ for inspection
// (one XML file per message, the pacs.002 rejects, and answer-key.csv).
// The database seed generates the same data in memory; this is for humans.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateDataset } from "@/lib/synth/generate";

const out = join(process.cwd(), "data", "synthetic");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "prevent"), { recursive: true });
mkdirSync(join(out, "repair"), { recursive: true });

const ds = generateDataset({ baseDate: new Date("2026-11-02T06:00:00Z") });

for (const p of ds.payments) {
  writeFileSync(join(out, p.mode, `${p.id}.${p.msgType}.xml`), p.xml);
  if (p.rejectXml) writeFileSync(join(out, p.mode, `${p.id}.pacs.002.xml`), p.rejectXml);
}

const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const header = ["payment_id", "bucket", "variant", "field_path", "expected_reason_code", "auto_suggestable", "detectable_pre_send", "difficulty", "related_payment_id", "description", "expected_fix"];
const rows = ds.answerKey.map((a) => [
  a.paymentId, a.bucket, a.variant, a.fieldPath, a.expectedReasonCode, a.autoSuggestable,
  a.detectablePreSend, a.difficulty, a.relatedPaymentId, a.description, JSON.stringify(a.expectedFix),
].map(csv).join(","));
writeFileSync(join(out, "answer-key.csv"), [header.join(","), ...rows].join("\n") + "\n");

const byBucket = ds.answerKey.reduce<Record<number, number>>((acc, a) => ({ ...acc, [a.bucket]: (acc[a.bucket] ?? 0) + 1 }), {});
console.log(`Wrote ${ds.payments.length} messages and ${ds.answerKey.length} answer-key rows to data/synthetic/`);
console.log("Errors by bucket:", byBucket);
