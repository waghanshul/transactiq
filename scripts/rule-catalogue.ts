// Writes docs/rule-catalogue.md from the rule metadata, so the catalogue can't
// drift from the code. Run with `npm run rules:catalogue`.
import { writeFileSync } from "node:fs";
import { ACTION_LABEL, BUCKETS, type Bucket } from "@/lib/reference/buckets";
import { RULES } from "@/lib/rules/engine";

const lines = [
  "# Rule catalogue",
  "",
  "Generated from `lib/rules/` by `npm run rules:catalogue`. Do not edit by hand.",
  "",
  `${RULES.length} rules across ${new Set(RULES.map((r) => r.bucket)).size} problem types. Every rule is a pure function with a vitest fixture in \`tests/rules.test.ts\`.`,
  "",
];
for (const b of Object.keys(BUCKETS).map(Number) as Bucket[]) {
  const rules = RULES.filter((r) => r.bucket === b);
  if (!rules.length) continue;
  lines.push(`## ${b}. ${BUCKETS[b].label}`, "", `Next step: ${ACTION_LABEL[BUCKETS[b].action]}.`, "");
  lines.push("| Rule | What it checks | Source |", "| --- | --- | --- |");
  for (const r of rules) lines.push(`| \`${r.id}\` ${r.title} | ${r.checks} | ${r.source} |`);
  lines.push("");
}
writeFileSync("docs/rule-catalogue.md", lines.join("\n"));
console.log(`Wrote docs/rule-catalogue.md (${RULES.length} rules)`);
