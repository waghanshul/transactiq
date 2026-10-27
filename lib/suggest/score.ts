// Scores suggestions against the answer key (metrics only; never used to
// make a suggestion).
import type { PostalAddress } from "@/lib/iso/types";
import type { RepairField, RepairValue } from "./types";

export interface KeyFix {
  paymentId: string;
  variant: string;
  fieldPath: string;
  autoSuggestable: boolean;
  expectedFix: unknown;
}

export interface ScoredSuggestion {
  paymentId: string;
  fieldPath: RepairField;
  newValue: RepairValue;
  confidence: number;
}

export interface SuggestionScore {
  address: { shown: number; right: number };
  other: { shown: number; right: number };
  /** Seeded errors that can be fixed, and how many got a suggestion above the threshold. */
  coverage: { fixable: number; withSuggestion: number };
  wrong: { paymentId: string; variant: string; got: string; want: string }[];
}

/** What the answer key expects for this error: the field and the value to compare. */
function expected(k: KeyFix): { field: RepairField; town?: string; country?: string; value?: string } | undefined {
  const fix = (k.expectedFix ?? {}) as Record<string, unknown>;
  const role = k.fieldPath.startsWith("Dbtr") ? "Dbtr" : "Cdtr";
  const min = fix.minimum as { TwnNm?: string; Ctry?: string } | undefined;
  const addr = fix.address as PostalAddress | undefined;
  if (min) return { field: `${role}/PstlAdr`, town: min.TwnNm, country: min.Ctry };
  if (addr) return { field: `${role}/PstlAdr`, town: addr.TwnNm, country: addr.Ctry };
  if (typeof fix.Ctry === "string") return { field: `${role}/PstlAdr`, country: fix.Ctry };
  if (Array.isArray(fix.AdrLine)) return { field: `${role}/PstlAdr` };
  if (typeof fix.bic === "string") return { field: "CdtrAgt/FinInstnId/BICFI", value: fix.bic };
  if (typeof fix.purposeCode === "string") return { field: "Purp/Cd", value: fix.purposeCode };
  if (typeof fix.name === "string") return { field: `${role}/Nm` as RepairField, value: fix.name };
  if (typeof fix.valueDate === "string") return { field: "ValueDate", value: fix.valueDate };
  if (typeof fix.endToEndId === "string") return { field: "PmtId/EndToEndId", value: fix.endToEndId };
  return undefined;
}

export function scoreSuggestions(key: KeyFix[], suggestions: ScoredSuggestion[], threshold: number): SuggestionScore {
  const out: SuggestionScore = { address: { shown: 0, right: 0 }, other: { shown: 0, right: 0 }, coverage: { fixable: 0, withSuggestion: 0 }, wrong: [] };
  for (const k of key.filter((x) => x.autoSuggestable)) {
    const e = expected(k);
    if (!e) continue;
    out.coverage.fixable++;
    const s = suggestions.find((x) => x.paymentId === k.paymentId && x.fieldPath === e.field);
    if (!s || s.confidence < threshold) continue;
    out.coverage.withSuggestion++;
    if (e.field.endsWith("/PstlAdr")) {
      const v = s.newValue as PostalAddress;
      const right = (!e.town || v.TwnNm?.toLowerCase() === e.town.toLowerCase()) && (!e.country || v.Ctry === e.country);
      out.address.shown++;
      if (right) out.address.right++;
      else out.wrong.push({ paymentId: k.paymentId, variant: k.variant, got: `${v.TwnNm}, ${v.Ctry}`, want: `${e.town}, ${e.country}` });
    } else {
      out.other.shown++;
      if (s.newValue === e.value) out.other.right++;
      else out.wrong.push({ paymentId: k.paymentId, variant: k.variant, got: String(s.newValue), want: String(e.value) });
    }
  }
  return out;
}
