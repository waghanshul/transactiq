// Network layer on top of the rules (S3-03, S3-04), run only when a repair is
// opened, never in the batch check: Gemini when the address engine is unsure,
// then an OpenStreetMap check that the town exists in the country.
import type { DB } from "@/lib/db/client";
import type { PostalAddress } from "@/lib/iso/types";
import { round, wrapLines } from "./address";
import type { Cache } from "./cache";
import { suggestConfig } from "./config";
import { askLlmForAddress } from "./llm";
import { checkTown, OSM_ATTRIBUTION } from "./nominatim";
import type { Suggestion } from "./types";

const isAddress = (s: Suggestion) => s.fieldPath.endsWith("/PstlAdr");

export async function enhanceSuggestion(s: Suggestion, cache: Cache, db?: DB): Promise<Suggestion> {
  if (!isAddress(s)) return s;
  let out = { ...s, checks: [...(s.checks ?? [])] };
  const old = s.oldValue as PostalAddress | undefined;

  // Gemini fallback: only for free-text addresses the rules couldn't read with confidence.
  if (s.source === "gazetteer" && s.confidence < suggestConfig.llmBelow && old?.AdrLine?.length) {
    const llm = await askLlmForAddress(old.AdrLine, cache);
    if (llm.ok) {
      const v = llm.value;
      const prev = s.newValue as PostalAddress;
      const agrees = prev.TwnNm?.toLowerCase() === v.town.toLowerCase() && prev.Ctry === v.country;
      const street = v.street ? wrapLines(v.street.split(",").map((x) => x.trim()).filter(Boolean)) : prev.AdrLine;
      const address: PostalAddress = {
        ...(v.postcode ? { PstCd: v.postcode } : prev.PstCd ? { PstCd: prev.PstCd } : {}),
        TwnNm: v.town,
        Ctry: v.country,
        ...(street?.length ? { AdrLine: street.slice(0, 2) } : {}),
      };
      out = {
        ...out,
        newValue: address,
        source: "llm",
        // An LLM answer alone never reaches the top band; agreement with the rules does.
        confidence: round(agrees ? Math.max(s.confidence, Math.min(0.9, v.confidence)) : Math.min(0.8, v.confidence)),
        reason: `Gemini read the address (the rules were unsure): ${v.reasoning}`,
        checks: [...out.checks, agrees ? "Agrees with the rules' best guess." : "The rules alone could not tell; check before accepting.",
          llm.cached ? "Answer reused from cache." : `Model: ${suggestConfig.geminiModel}.`],
      };
    } else {
      out.checks.push(llm.reason);
    }
  }

  // OpenStreetMap: does the town exist in that country?
  const v = out.newValue as PostalAddress;
  if (v.TwnNm && v.Ctry) {
    const c = await checkTown(v.TwnNm, v.Ctry, cache, db);
    if (c.status === "found") {
      out.confidence = round(Math.min(0.99, out.confidence + 0.02));
      out.checks.push(`OpenStreetMap confirms ${v.TwnNm} is a place in ${v.Ctry}. ${OSM_ATTRIBUTION}.`);
    } else if (c.status === "not_found") {
      out.confidence = round(out.confidence * 0.7);
      out.checks.push(`OpenStreetMap has no place called ${v.TwnNm} in ${v.Ctry}: check the spelling. ${OSM_ATTRIBUTION}.`);
    } else if ("reason" in c) {
      out.checks.push(c.reason);
    }
  }
  return out;
}
