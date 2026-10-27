// Bucket 1: unstructured or malformed postal addresses.
// Source: Swift CBPR+ postal address rules for the 14 Nov 2026 cut-over and the
// PMPG hybrid address guidance: town (TwnNm) and country (Ctry, ISO 3166 alpha-2)
// in their own fields, at most two AdrLine of 70 characters, and nothing in an
// AdrLine that already has a structured field.
import { isCountryCode } from "@/lib/reference/countries";
import { containsWord, hasStructuredParts, PARTY, party, type PartyRole } from "./helpers";
import type { Finding, Rule } from "./types";

const ROLES: PartyRole[] = ["debtor", "creditor"];
const SOURCE = "Swift CBPR+ postal address requirements (14 Nov 2026); PMPG hybrid address guidance";

export const addressUnstructured: Rule = {
  id: "ADDR-UNSTRUCTURED",
  bucket: 1,
  title: "Address is free text only",
  checks: "Party address uses AdrLine without town and country in their own fields.",
  source: SOURCE,
  run: ({ msg }) => {
    const out: Finding[] = [];
    for (const role of ROLES) {
      const a = party(msg, role).address;
      if (!a?.AdrLine?.length) continue;
      if (a.TwnNm && a.Ctry) continue;
      out.push({
        ruleId: "ADDR-UNSTRUCTURED", bucket: 1, severity: "error",
        fieldPath: `${PARTY[role].tag}/PstlAdr`, reasonCode: PARTY[role].addressCode,
        message: `${PARTY[role].label} address is free text only. From 14 November 2026 Swift rejects this: town and country must each go in their own field (TwnNm and Ctry).`,
      });
    }
    return out;
  },
};

export const addressTownCountryMissing: Rule = {
  id: "ADDR-TOWN-COUNTRY-MISSING",
  bucket: 1,
  title: "Town or country missing",
  checks: "Structured address has no TwnNm or no Ctry (and no free-text lines).",
  source: SOURCE,
  run: ({ msg }) => {
    const out: Finding[] = [];
    for (const role of ROLES) {
      const a = party(msg, role).address;
      if (!a || a.AdrLine?.length || !hasStructuredParts(a)) continue;
      const missing = [!a.TwnNm && "town", !a.Ctry && "country"].filter(Boolean) as string[];
      if (missing.length === 0) continue;
      out.push({
        ruleId: "ADDR-TOWN-COUNTRY-MISSING", bucket: 1, severity: "error",
        fieldPath: `${PARTY[role].tag}/PstlAdr/${!a.Ctry ? "Ctry" : "TwnNm"}`, reasonCode: PARTY[role].addressCode,
        message: `${PARTY[role].label} address has no ${missing.join(" or ")}. Both are mandatory in structured and hybrid addresses.`,
      });
    }
    return out;
  },
};

export const addressCountryCode: Rule = {
  id: "ADDR-COUNTRY-CODE",
  bucket: 1,
  title: "Country is not an ISO code",
  checks: "Ctry is not a two-letter ISO 3166-1 alpha-2 code.",
  source: "ISO 20022 PostalAddress24: Ctry is CountryCode ([A-Z]{2}, ISO 3166-1)",
  run: ({ msg }) => {
    const out: Finding[] = [];
    for (const role of ROLES) {
      const ctry = party(msg, role).address?.Ctry;
      if (ctry === undefined || ctry === "" || isCountryCode(ctry)) continue;
      out.push({
        ruleId: "ADDR-COUNTRY-CODE", bucket: 1, severity: "error",
        fieldPath: `${PARTY[role].tag}/PstlAdr/Ctry`, reasonCode: PARTY[role].addressCode,
        message: `${PARTY[role].label} country is written as "${ctry}". It must be the two-letter ISO code, for example IN, JP or US.`,
      });
    }
    return out;
  },
};

export const addressDuplicatedInLine: Rule = {
  id: "ADDR-HYBRID-DUPLICATE",
  bucket: 1,
  title: "Town or country repeated in a free-text line",
  checks: "Hybrid address repeats TwnNm or the country in an AdrLine.",
  source: "PMPG hybrid address guidance: structured data takes precedence and must not be repeated in AdrLine",
  run: ({ msg }) => {
    const out: Finding[] = [];
    for (const role of ROLES) {
      const a = party(msg, role).address;
      if (!a?.AdrLine?.length || !a.TwnNm || !a.Ctry) continue;
      const repeated = a.AdrLine.some((line) => containsWord(line, a.TwnNm!));
      if (!repeated) continue;
      out.push({
        ruleId: "ADDR-HYBRID-DUPLICATE", bucket: 1, severity: "error",
        fieldPath: `${PARTY[role].tag}/PstlAdr/AdrLine`, reasonCode: PARTY[role].addressCode,
        message: `${PARTY[role].label} address repeats the town "${a.TwnNm}" in a free-text line. In a hybrid address, anything with its own field must not appear in AdrLine.`,
      });
    }
    return out;
  },
};

export const addressLineLimits: Rule = {
  id: "ADDR-LINE-LIMITS",
  bucket: 1,
  title: "Too many or too long address lines",
  checks: "More than 2 AdrLine in a hybrid address, or any AdrLine over 70 characters.",
  source: SOURCE,
  run: ({ msg }) => {
    const out: Finding[] = [];
    for (const role of ROLES) {
      const a = party(msg, role).address;
      const lines = a?.AdrLine ?? [];
      if (lines.length === 0 || !a?.TwnNm || !a?.Ctry) continue; // free-text-only is reported by ADDR-UNSTRUCTURED
      const long = lines.find((l) => l.length > 70);
      if (lines.length <= 2 && !long) continue;
      out.push({
        ruleId: "ADDR-LINE-LIMITS", bucket: 1, severity: "error",
        fieldPath: `${PARTY[role].tag}/PstlAdr/AdrLine`, reasonCode: PARTY[role].addressCode,
        message: long
          ? `${PARTY[role].label} address line is ${long.length} characters. Hybrid addresses allow at most 70 per line.`
          : `${PARTY[role].label} address has ${lines.length} free-text lines. Hybrid addresses allow at most 2.`,
      });
    }
    return out;
  },
};

export const ADDRESS_RULES = [addressUnstructured, addressTownCountryMissing, addressCountryCode, addressDuplicatedInLine, addressLineLimits];
