// npm run import:gleif -- path/to/LEI-BIC-YYYYMMDD.csv
// Imports real BICs for the demo's corridor countries from GLEIF's free
// BIC-to-LEI relationship file (download and unzip it from
// https://www.gleif.org/en/lei-data/lei-mapping/download-bic-to-lei-relationship-files
// and respect its licence agreement). The file maps BIC to LEI only, so the
// bank name is stored as the LEI; look names up via api.gleif.org if needed.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { getDb } from "@/lib/db/client";
import { bicDirectory } from "@/lib/db/schema";
import { parseCsvLine } from "./csv";

const COUNTRIES = new Set(["IN", "JP", "US", "AE", "SG", "GB", "DE"]);

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run import:gleif -- path/to/LEI-BIC.csv");
  const db = getDb();
  const rl = createInterface({ input: createReadStream(file) });
  let header: string[] | undefined;
  let batch: { bic: string; name: string; country: string; source: string }[] = [];
  let total = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    await db.insert(bicDirectory).values(batch).onConflictDoNothing();
    total += batch.length;
    batch = [];
  };

  for await (const line of rl) {
    const cols = parseCsvLine(line);
    if (!header) { header = cols.map((c) => c.trim().toUpperCase()); continue; }
    const bic = cols[header.indexOf("BIC")]?.trim();
    const lei = cols[header.indexOf("LEI")]?.trim();
    if (!bic || bic.length < 8) continue;
    const country = bic.slice(4, 6);
    if (!COUNTRIES.has(country)) continue;
    batch.push({ bic, name: `LEI ${lei}`, country, source: "gleif" });
    if (batch.length >= 200) await flush();
  }
  await flush();
  console.log(`Imported ${total} BICs from GLEIF for ${[...COUNTRIES].join(", ")}.`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
