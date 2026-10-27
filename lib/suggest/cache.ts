// api_cache wrapper so free-tier quotas last: every Gemini and Nominatim answer
// is stored by a hash of its input and reused.
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { apiCache } from "@/lib/db/schema";

export const hashKey = (provider: string, input: unknown) =>
  `${provider}:${createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32)}`;

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, provider: string, value: unknown): Promise<void>;
}

export function dbCache(db: DB): Cache {
  return {
    async get<T>(key: string) {
      const [row] = await db.select({ value: apiCache.value }).from(apiCache).where(eq(apiCache.key, key));
      return row?.value as T | undefined;
    },
    async set(key, provider, value) {
      await db.insert(apiCache).values({ key, provider, value: value as object })
        .onConflictDoUpdate({ target: apiCache.key, set: { value: value as object, createdAt: new Date() } });
    },
  };
}

/** In-memory cache for tests and scripts. */
export function memoryCache(): Cache {
  const m = new Map<string, unknown>();
  return {
    async get<T>(key: string) { return m.get(key) as T | undefined; },
    async set(key, _provider, value) { m.set(key, value); },
  };
}
