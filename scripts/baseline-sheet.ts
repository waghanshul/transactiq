// npm run baseline:sheet: picks 20 seeded errors (spread across buckets) for
// task S1-18. Fix each by hand from the raw XML, time yourself, and fill in the
// minutes column. This is the "before" number on the metrics page.
import { writeFileSync, mkdirSync } from "node:fs";
import { generateDataset } from "@/lib/synth/generate";
import { BUCKETS } from "@/lib/reference/buckets";

const ds = generateDataset({ baseDate: new Date("2026-11-02T06:00:00Z") });
const perBucket: Record<number, number> = { 1: 6, 2: 2, 3: 2, 4: 2, 5: 2, 6: 3, 7: 1, 8: 2 };
const picked = Object.entries(perBucket).flatMap(([b, n]) =>
  ds.answerKey.filter((a) => a.bucket === Number(b) && a.paymentId.startsWith("PRV")).slice(0, n),
);

const lines = ["payment_id,bucket,bucket_label,variant,minutes_to_fix,notes"];
for (const a of picked) lines.push(`${a.paymentId},${a.bucket},"${BUCKETS[a.bucket].label}",${a.variant},,`);
mkdirSync("docs", { recursive: true });
writeFileSync("docs/manual-baseline.csv", lines.join("\n") + "\n");
console.log(`Wrote docs/manual-baseline.csv with ${picked.length} errors to time by hand.`);
