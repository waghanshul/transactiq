// npm run seed: wipes demo data and loads the synthetic dataset into DATABASE_URL.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { getDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/seed/seed";

async function main() {
  const summary = await seedDatabase(getDb());
  console.log("Seeded demo data:", summary);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
