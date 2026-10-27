// Bucket 9: possible sanctions match. This is a stub that only ROUTES the
// payment to compliance with the names that matched. It never decides a case,
// and no other rule or suggestion touches a payment once it fires.
import { PARTY, party, type PartyRole } from "./helpers";
import type { Finding, Rule } from "./types";

export const SCREENING_THRESHOLD = 0.9;

const LEGAL_SUFFIXES = /\b(ltd|limited|llc|inc|corp|co|kk|gmbh|pte|pvt|fze|fzco|plc|sa|ag)\b/g;

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Jaro-Winkler similarity in [0, 1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatch = new Array<boolean>(a.length).fill(false);
  const bMatch = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bMatch[j] || a[i] !== b[j]) continue;
      aMatch[i] = bMatch[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let t = 0;
  for (let i = 0, k = 0; i < a.length; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

export const screening: Rule = {
  id: "SCREEN-NAME-MATCH",
  bucket: 9,
  title: "Possible sanctions match",
  checks: `Debtor or creditor name scores ${SCREENING_THRESHOLD} or higher (Jaro-Winkler) against a watchlist name or alias.`,
  source: "Screening stub over a synthetic watchlist (optionally the public OFAC SDN list)",
  run: ({ msg, ref }) => {
    const out: Finding[] = [];
    for (const role of ["debtor", "creditor"] as PartyRole[]) {
      const name = party(msg, role).name;
      if (!name) continue;
      const n = normaliseName(name);
      let best: { listed: string; score: number } | undefined;
      for (const w of ref.watchlist) {
        for (const candidate of [w.name, ...w.aliases]) {
          const score = jaroWinkler(n, normaliseName(candidate));
          if (score >= SCREENING_THRESHOLD && (!best || score > best.score)) best = { listed: w.name, score };
        }
      }
      if (!best) continue;
      out.push({
        ruleId: "SCREEN-NAME-MATCH", bucket: 9, severity: "compliance",
        fieldPath: `${PARTY[role].tag}/Nm`, reasonCode: null,
        message: `${PARTY[role].label} name "${name}" is ${Math.round(best.score * 100)}% similar to watchlist entry "${best.listed}". Sent to compliance unchanged; no fix will be suggested.`,
      });
    }
    return out;
  },
};
