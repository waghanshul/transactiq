// The OpenStreetMap layer must never turn an unsure suggestion into a shown one.
import { describe, expect, it } from "vitest";
import { hashKey, memoryCache } from "@/lib/suggest/cache";
import { suggestConfig } from "@/lib/suggest/config";
import { enhanceSuggestion } from "@/lib/suggest/enhance";
import type { Suggestion } from "@/lib/suggest/types";

const base = (confidence: number): Suggestion => ({
  fieldPath: "Cdtr/PstlAdr",
  oldValue: { AdrLine: ["4-8-11 Itaya-machi Naka-ku 430-1477"] },
  newValue: { PstCd: "430-1477", TwnNm: "Hamamatsu", Ctry: "JP" },
  source: "rule", confidence, reason: "test", resolves: ["ADDR-UNSTRUCTURED"],
});

async function withFoundTown(s: Suggestion) {
  const cache = memoryCache();
  await cache.set(hashKey("nominatim", { town: "hamamatsu", country: "JP" }), "nominatim", { found: true });
  return enhanceSuggestion(s, cache);
}

describe("OpenStreetMap cross-check", () => {
  it("does not lift a below-threshold suggestion over the threshold", async () => {
    const out = await withFoundTown(base(suggestConfig.minConfidence - 0.02));
    expect(out.confidence).toBeLessThan(suggestConfig.minConfidence);
    expect(out.checks?.some((c) => c.includes("OpenStreetMap confirms"))).toBe(true);
  });
  it("still firms up a suggestion that is already shown", async () => {
    const out = await withFoundTown(base(0.9));
    expect(out.confidence).toBe(0.92);
  });
});
