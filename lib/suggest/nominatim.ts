// OpenStreetMap Nominatim cross-check (S3-04): does the suggested town exist
// in the suggested country? Follows the Nominatim usage policy: at most one
// request per second across all users (enforced through api_cache), an
// identifying User-Agent, results cached, and OSM attribution shown in the UI.
// Only a town and a country code are sent, never a street or a party name.
import { sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { hashKey, type Cache } from "./cache";
import { suggestConfig } from "./config";

export const NOMINATIM_USER_AGENT = process.env.NOMINATIM_UA || "TransactIQ-POC/0.3 (synthetic-data demo; https://github.com/waghanshul/transactiq)";
export const OSM_ATTRIBUTION = "Town check: © OpenStreetMap contributors (ODbL), via Nominatim";

export type TownCheck = { status: "found" | "not_found"; cached: boolean } | { status: "unavailable"; reason: string };

/** Waits until a second has passed since the last Nominatim call from any instance. */
async function throttle(db: DB) {
  for (let i = 0; i < 5; i++) {
    const res = await db.execute(sql`
      insert into api_cache (key, provider, value, created_at) values ('nominatim:last', 'nominatim', '{}'::jsonb, now())
      on conflict (key) do update set created_at = now()
      where api_cache.created_at < now() - interval '1 second'
      returning key`);
    const rows = (res as unknown as { rows?: unknown[] }).rows ?? (res as unknown as unknown[]);
    if (Array.isArray(rows) && rows.length > 0) return;
    await new Promise((r) => setTimeout(r, 1100));
  }
  throw new Error("Nominatim is busy");
}

export async function checkTown(town: string, country: string, cache: Cache, db?: DB): Promise<TownCheck> {
  if (!suggestConfig.nominatimEnabled) return { status: "unavailable", reason: "OpenStreetMap check is switched off." };
  const key = hashKey("nominatim", { town: town.toLowerCase(), country });
  const hit = await cache.get<{ found: boolean }>(key);
  if (hit) return { status: hit.found ? "found" : "not_found", cached: true };
  try {
    if (db) await throttle(db);
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
      city: town, countrycodes: country.toLowerCase(), format: "jsonv2", limit: "1",
    })}`;
    const res = await fetch(url, { headers: { "User-Agent": NOMINATIM_USER_AGENT, "Accept-Language": "en" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { status: "unavailable", reason: `OpenStreetMap answered ${res.status}.` };
    const found = ((await res.json()) as unknown[]).length > 0;
    await cache.set(key, "nominatim", { found });
    return { status: found ? "found" : "not_found", cached: false };
  } catch (err) {
    return { status: "unavailable", reason: `OpenStreetMap check unavailable (${err instanceof Error ? err.message : "network error"}).` };
  }
}
