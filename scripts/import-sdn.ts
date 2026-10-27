// npm run import:sdn -- path/to/sdn.csv
// Imports entity names from the US Treasury OFAC SDN list (public data,
// https://ofac.treasury.gov/specially-designated-nationals-list-data-formats-data-schemas)
// into the screening stub. sdn.csv has no header: ent_num, SDN_Name, SDN_Type, Program, ...
// Only non-individual entries are imported, which keeps the table small.
// Reminder: the stub only routes a look-alike to compliance; it never decides a case.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { readFileSync } from "node:fs";
import { getDb } from "@/lib/db/client";
import { screeningNames } from "@/lib/db/schema";
import { parseCsvLine } from "./csv";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run import:sdn -- path/to/sdn.csv");
  const db = getDb();
  const rows = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  const entities = rows
    .filter((c) => c.length > 3 && c[2]?.trim().toLowerCase() !== "individual")
    .map((c) => ({ name: c[1].trim(), aliases: [], program: c[3]?.trim() || null, source: "ofac" }));

  for (let i = 0; i < entities.length; i += 200) {
    await db.insert(screeningNames).values(entities.slice(i, i + 200));
  }
  console.log(`Imported ${entities.length} OFAC SDN entity names.`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
