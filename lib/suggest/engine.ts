// Suggestion engine (S3-01 to S3-07): one suggestion per field that has a
// fixable finding. Pure and synchronous: no database, no network, and never
// the answer key. Network cross-checks (OpenStreetMap, Gemini) are layered on
// afterwards by enhance.ts, only when a repair is opened.
import type { ParsedParty, ParsedTransfer } from "@/lib/iso/parse";
import { transliterate } from "@/lib/iso/charset";
import type { PostalAddress } from "@/lib/iso/types";
import { PURPOSE_CODE_SET } from "@/lib/reference/codes";
import { countryCodeFromName, isCountryCode } from "@/lib/reference/countries";
import { IN_PIN_PREFIX, jpTownFromPostcode, TOWNS } from "@/lib/reference/towns";
import { repeatsTown } from "@/lib/rules/address";
import { analyseAddressLines, crossCheckWithRecord, round, wrapLines } from "./address";
import { canSuggest } from "./guardrails";
import { NO_SUGGESTION_RULES, type RepairField, type Suggestion } from "./types";

export interface PartyRecord {
  name: string;
  address: PostalAddress;
  agentBic?: string;
}

export interface SuggestContext {
  /** The client's master record (the debtor). */
  client?: PartyRecord;
  /** The beneficiary record the bank holds for this creditor, if any. */
  beneficiary?: PartyRecord;
  /** BIC directory: BIC -> country and bank name. */
  bics: Map<string, { country: string; name: string }>;
  /** Purpose codes on this client's earlier payments on the same corridor. */
  purposeHistory: { code: string; sameCreditor: boolean }[];
  /** Country the corridor pays into. */
  creditorCountry: string;
  /** When the payment arrived, to read ambiguous dates. */
  receivedAt: Date;
  /** End-to-end references on the client's other payments, to learn their format. */
  clientReferences?: string[];
}

export interface FindingRef {
  ruleId: string;
  fieldPath: string;
}

type Role = "debtor" | "creditor";
const TAG: Record<Role, "Dbtr" | "Cdtr"> = { debtor: "Dbtr", creditor: "Cdtr" };
const roleOf = (fieldPath: string): Role => (fieldPath.startsWith("Dbtr") ? "debtor" : "creditor");
const partyOf = (msg: ParsedTransfer, role: Role): ParsedParty => (role === "debtor" ? msg.debtor : msg.creditor);
const recordOf = (ctx: SuggestContext, role: Role) => (role === "debtor" ? ctx.client : ctx.beneficiary);
const recordLabel = (role: Role) => (role === "debtor" ? "client record" : "beneficiary record");

/** Maps a finding to the field a repair changes. */
export function repairFieldFor(f: FindingRef): RepairField | undefined {
  if (NO_SUGGESTION_RULES.has(f.ruleId)) return undefined;
  if (f.ruleId.startsWith("ADDR-") || f.ruleId === "PARTY-ADDRESS-MISSING") return `${TAG[roleOf(f.fieldPath)]}/PstlAdr`;
  if (f.ruleId === "PARTY-NAME-MISSING" || f.ruleId === "FMT-CHARSET") return `${TAG[roleOf(f.fieldPath)]}/Nm`;
  if (f.ruleId.startsWith("BIC-")) return f.fieldPath.startsWith("DbtrAgt") ? "DbtrAgt/FinInstnId/BICFI" : "CdtrAgt/FinInstnId/BICFI";
  if (f.ruleId.startsWith("PURPOSE-")) return "Purp/Cd";
  if (f.ruleId === "FMT-E2E-LENGTH") return "PmtId/EndToEndId";
  if (f.ruleId === "FMT-DATE") return "ValueDate";
  return undefined;
}

export function suggestForPayment(
  msg: ParsedTransfer,
  findings: FindingRef[],
  status: string,
  ctx: SuggestContext,
): Suggestion[] {
  if (!canSuggest(status, findings)) return [];
  const byField = new Map<RepairField, string[]>();
  for (const f of findings) {
    const field = repairFieldFor(f);
    if (field) byField.set(field, [...(byField.get(field) ?? []), f.ruleId]);
  }
  const out: Suggestion[] = [];
  for (const [field, rules] of byField) {
    const s = suggestField(field, rules, msg, ctx);
    if (s) out.push(s);
  }
  return out;
}

function suggestField(field: RepairField, rules: string[], msg: ParsedTransfer, ctx: SuggestContext): Suggestion | undefined {
  switch (field) {
    case "Dbtr/PstlAdr":
    case "Cdtr/PstlAdr":
      return suggestAddress(field, rules, msg, ctx);
    case "Dbtr/Nm":
    case "Cdtr/Nm":
      return suggestName(field, rules, msg, ctx);
    case "CdtrAgt/FinInstnId/BICFI":
    case "DbtrAgt/FinInstnId/BICFI":
      return suggestBic(field, rules, msg, ctx);
    case "Purp/Cd":
      return suggestPurpose(rules, msg, ctx);
    case "PmtId/EndToEndId":
      return suggestEndToEnd(rules, msg, ctx);
    case "ValueDate":
      return suggestDate(rules, msg, ctx);
  }
}

// ---------- Addresses ----------

const NOISE = /^(attn|attention|c\/o|ref|reference|vendor|dept|department|accounts payable)\b|\b(department|vendor master|ref \d)/i;

function suggestAddress(field: RepairField, rules: string[], msg: ParsedTransfer, ctx: SuggestContext): Suggestion | undefined {
  const role = roleOf(field);
  const current = partyOf(msg, role).address;
  const record = recordOf(ctx, role);
  const label = recordLabel(role);

  // No address at all: the bank's own record is the only honest source.
  if (rules.includes("PARTY-ADDRESS-MISSING") || !current) {
    if (!record) return undefined;
    return {
      fieldPath: field, oldValue: current, newValue: record.address, source: "master", confidence: 0.9,
      reason: `The message has no ${role} address. This is the address on the ${label} for ${record.name}; confirm it is still current.`,
      resolves: rules,
    };
  }

  // Free text only: the address engine works from the text.
  if (rules.includes("ADDR-UNSTRUCTURED")) {
    const a = crossCheckWithRecord(analyseAddressLines(current.AdrLine ?? []), record?.address, label);
    const partial: PostalAddress = a.address ?? { AdrLine: current.AdrLine?.slice(0, 2) };
    return {
      fieldPath: field, oldValue: current, newValue: partial, source: "gazetteer", confidence: a.confidence,
      reason: a.address
        ? `Town and country moved into their own fields: ${a.evidence.join("; ")}.`
        : `Could not find the town and country with confidence: ${a.doubts.join("; ")}.`,
      checks: a.doubts.length && a.address ? a.doubts.map((d) => `Doubt: ${d}`) : undefined,
      // Below the threshold the best guess is just one of the options, never preselected.
      options: (() => {
        const opts = [...(a.address && a.confidence < 0.9 && a.town && a.country ? [{ town: a.town, country: a.country }] : []), ...a.alternatives];
        return opts.length ? opts.map((o) => ({ ...partial, TwnNm: o.town, Ctry: o.country })) : undefined;
      })(),
      resolves: rules,
    };
  }

  // Structured or hybrid address with specific problems: fix each in turn.
  const next: PostalAddress = { ...current, AdrLine: current.AdrLine ? [...current.AdrLine] : undefined };
  const steps: string[] = [];
  let confidence = 1;
  let source: Suggestion["source"] = "rule";

  if (rules.includes("ADDR-COUNTRY-CODE") && next.Ctry) {
    const code = countryCodeFromName(next.Ctry);
    if (!code) return undefined;
    steps.push(`"${next.Ctry}" is the country name for ${code}`);
    next.Ctry = code;
    confidence = Math.min(confidence, 0.98);
  }
  if (rules.includes("ADDR-TOWN-COUNTRY-MISSING")) {
    if (!next.Ctry) {
      const fromTown = next.TwnNm ? TOWNS.find((t) => t.name.toLowerCase() === next.TwnNm!.toLowerCase() || t.aliases?.some((x) => x.toLowerCase() === next.TwnNm!.toLowerCase())) : undefined;
      if (fromTown) {
        next.Ctry = fromTown.country;
        steps.push(`${next.TwnNm} is a town in ${fromTown.country}`);
        confidence = Math.min(confidence, 0.92);
        source = "gazetteer";
      } else if (record?.address.Ctry) {
        next.Ctry = record.address.Ctry;
        steps.push(`the ${label} gives the country as ${record.address.Ctry}`);
        confidence = Math.min(confidence, 0.85);
        source = "master";
      } else return undefined;
    }
    if (!next.TwnNm) {
      const fromPost = next.PstCd ? (next.Ctry === "JP" ? jpTownFromPostcode(next.PstCd) : next.Ctry === "IN" ? IN_PIN_PREFIX[next.PstCd.slice(0, 3)] : undefined) : undefined;
      const town = fromPost ?? record?.address.TwnNm;
      if (!town) return undefined;
      next.TwnNm = town;
      steps.push(fromPost ? `postcode ${next.PstCd} is in ${town}` : `the ${label} gives the town as ${town}`);
      confidence = Math.min(confidence, fromPost ? 0.65 : 0.85);
      source = fromPost ? "gazetteer" : "master";
    }
    if (record?.address.TwnNm && record.address.Ctry) {
      const agrees = record.address.TwnNm.toLowerCase() === next.TwnNm?.toLowerCase() && record.address.Ctry === next.Ctry;
      if (agrees) { confidence = Math.max(confidence, 0.97); steps.push(`matches the ${label}`); }
      else { confidence = Math.min(confidence, 0.55); steps.push(`but the ${label} says ${record.address.TwnNm}, ${record.address.Ctry}`); }
    }
  }
  if (rules.includes("ADDR-HYBRID-DUPLICATE") && next.AdrLine && next.TwnNm) {
    const keep = next.AdrLine
      .flatMap((l) => l.split(","))
      .map((s) => s.trim())
      .filter((s) => s && !repeatsTown(s, next.TwnNm!) && !(next.Ctry && countryCodeFromName(s) === next.Ctry));
    steps.push(`removed the repeated town "${next.TwnNm}" from the free-text line`);
    next.AdrLine = wrapLines(keep);
    confidence = Math.min(confidence, 0.95);
  }
  if (rules.includes("ADDR-LINE-LIMITS") && next.AdrLine) {
    const segments = next.AdrLine.flatMap((l) => l.split(",")).map((s) => s.trim()).filter(Boolean);
    const kept = segments.filter((s) => !NOISE.test(s));
    const dropped = segments.filter((s) => NOISE.test(s));
    const wrapped = wrapLines(kept);
    if (dropped.length) steps.push(`dropped text that is not part of the address (${dropped.map((d) => `"${d}"`).join(", ")})`);
    else steps.push("re-wrapped the free text into lines of at most 70 characters");
    confidence = Math.min(confidence, wrapped.length <= 2 ? (dropped.length ? 0.85 : 0.8) : 0.4);
    next.AdrLine = wrapped.slice(0, 2);
  }
  if (next.AdrLine && next.AdrLine.length === 0) delete next.AdrLine;
  if (!next.AdrLine) delete next.AdrLine;

  return {
    fieldPath: field, oldValue: current, newValue: next, source, confidence: round(confidence),
    reason: `${capitalise(steps.join("; "))}.`,
    resolves: rules,
  };
}

// ---------- Names ----------

function suggestName(field: RepairField, rules: string[], msg: ParsedTransfer, ctx: SuggestContext): Suggestion | undefined {
  const role = roleOf(field);
  const current = partyOf(msg, role).name;
  const record = recordOf(ctx, role);
  if (rules.includes("PARTY-NAME-MISSING")) {
    if (!record) return undefined;
    return {
      fieldPath: field, oldValue: current, newValue: record.name, source: "master", confidence: role === "debtor" ? 0.95 : 0.88,
      reason: `The ${role} name is empty. This is the name on the ${recordLabel(role)}.`, resolves: rules,
    };
  }
  if (rules.includes("FMT-CHARSET") && current) {
    const t = transliterate(current).replace(/\s+/g, " ").trim();
    const lost = (t.match(/\?/g)?.length ?? 0) > (current.match(/\?/g)?.length ?? 0);
    if (!lost && /[A-Za-z]/.test(t)) {
      return {
        fieldPath: field, oldValue: current, newValue: t, source: "rule", confidence: 1,
        reason: "Replaced characters outside the CBPR+ set with their plain equivalents (curly quotes, dashes, accents). Nothing else changes.",
        resolves: rules,
      };
    }
    if (record && /^[\x20-\x7E]+$/.test(record.name)) {
      return {
        fieldPath: field, oldValue: current, newValue: record.name, source: "master", confidence: 0.85,
        reason: `The name is in a script CBPR+ does not allow and can't be transliterated safely. The ${recordLabel(role)} has the Latin-script name; confirm it is the same party.`,
        resolves: rules,
      };
    }
  }
  return undefined;
}

// ---------- BIC ----------

function suggestBic(field: RepairField, rules: string[], msg: ParsedTransfer, ctx: SuggestContext): Suggestion | undefined {
  const current = field.startsWith("Cdtr") ? msg.creditorAgentBic : msg.debtorAgentBic;
  const partyCountry = (field.startsWith("Cdtr") ? msg.creditor.address?.Ctry : msg.debtor.address?.Ctry);
  const country = isCountryCode(partyCountry) ? partyCountry! : ctx.creditorCountry;
  const record = field.startsWith("Cdtr") ? ctx.beneficiary : undefined;
  const candidates = [...ctx.bics.entries()].filter(([, b]) => b.country === country).map(([bic]) => bic);
  const known = current ? ctx.bics.get(current) : undefined;
  const problem = !current ? "There is no bank code."
    : rules.includes("BIC-FORMAT") ? `${current} is not a BIC: a BIC has 8 or 11 characters.`
      : known && known.country !== country ? `${current} is ${known.name} in ${known.country}, but the ${field.startsWith("Cdtr") ? "creditor" : "debtor"} is in ${country}.`
        : `${current} is not in the BIC directory.`;
  if (record?.agentBic && ctx.bics.get(record.agentBic)?.country === country) {
    const bank = ctx.bics.get(record.agentBic)!.name;
    return {
      fieldPath: field, oldValue: current, newValue: record.agentBic, source: "master", confidence: 0.92,
      reason: `${problem} The beneficiary record pays ${record.name} through ${bank} (${record.agentBic}), which is in the BIC directory.`,
      options: candidates.filter((c) => c !== record.agentBic).slice(0, 3), resolves: rules,
    };
  }
  if (!candidates.length) return undefined;
  const scored = candidates
    .map((bic) => ({ bic, score: sharedPrefix(bic, current ?? "") + (current && bic.slice(4, 6) === current.slice(4, 6) ? 1 : 0) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const unique = candidates.length === 1 || best.score > (scored[1]?.score ?? -1) + 2;
  return {
    fieldPath: field, oldValue: current, newValue: best.bic, source: "directory", confidence: unique ? 0.75 : 0.5,
    reason: unique
      ? `${problem} ${best.bic} (${ctx.bics.get(best.bic)!.name}) is the closest ${country} bank code in the directory.`
      : `${problem} Several ${country} banks are possible; ask the client which bank holds the account.`,
    options: scored.slice(0, 4).map((s) => s.bic), resolves: rules,
  };
}

const sharedPrefix = (a: string, b: string) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };

// ---------- Purpose code ----------

function suggestPurpose(rules: string[], msg: ParsedTransfer, ctx: SuggestContext): Suggestion | undefined {
  const valid = ctx.purposeHistory.filter((h) => PURPOSE_CODE_SET.has(h.code));
  const pool = valid.some((h) => h.sameCreditor) ? valid.filter((h) => h.sameCreditor) : valid;
  if (!pool.length) return undefined;
  const counts = new Map<string, number>();
  for (const h of pool) counts.set(h.code, (counts.get(h.code) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [code, n] = ranked[0];
  const share = n / pool.length;
  const sameCreditor = pool[0].sameCreditor;
  return {
    fieldPath: "Purp/Cd", oldValue: msg.purposeCode, newValue: code, source: "history",
    confidence: round(Math.min(0.95, (sameCreditor ? 0.6 : 0.45) + (sameCreditor ? 0.35 : 0.3) * share)),
    reason: sameCreditor
      ? `${code} was used on ${n} of ${pool.length} other payments from this client to ${msg.creditor.name ?? "this creditor"}.`
      : `${code} is the most common purpose on this client's payments in this corridor (${n} of ${pool.length}); none went to this creditor before.`,
    options: ranked.slice(1, 4).map(([c]) => c), resolves: rules,
  };
}

// ---------- Format ----------

/** "KAZE-INV-178387" -> "AAAA-AAA-999999": the format, without the values. */
const shapeOf = (ref: string) => ref.replace(/[A-Z]/g, "A").replace(/[a-z]/g, "a").replace(/\d/g, "9");

function suggestEndToEnd(rules: string[], msg: ParsedTransfer, ctx: SuggestContext): Suggestion | undefined {
  const current = msg.endToEndId;
  if (!current) return undefined;
  const prefixes: string[] = [];
  for (let i = current.length; i > 0; i = current.lastIndexOf("-", i - 1)) {
    const p = current.slice(0, i);
    if (p.length <= 35) prefixes.push(p);
    if (i <= 0) break;
  }
  // Best: the longest prefix that has the same format as the client's other references.
  const known = new Set((ctx.clientReferences ?? []).filter((r) => r.length <= 35).map(shapeOf));
  const matching = prefixes.find((p) => known.has(shapeOf(p)));
  if (matching) {
    const example = ctx.clientReferences!.find((r) => shapeOf(r) === shapeOf(matching));
    return {
      fieldPath: "PmtId/EndToEndId", oldValue: current, newValue: matching, source: "history", confidence: 0.9,
      reason: `Removed the text added after the reference. "${matching}" has the same format as this client's other references (for example ${example}). The client reconciles on it, so it must stay theirs.`,
      resolves: rules,
    };
  }
  const fallback = prefixes[0] ?? current.slice(0, 35);
  return {
    fieldPath: "PmtId/EndToEndId", oldValue: current, newValue: fallback, source: "rule", confidence: 0.5,
    reason: "Shortened to 35 characters. The client reconciles on this reference: confirm the right value with them before sending.",
    resolves: rules,
  };
}

function suggestDate(rules: string[], msg: ParsedTransfer, ctx: SuggestContext): Suggestion | undefined {
  const raw = msg.valueDate?.trim();
  if (!raw) return undefined;
  const iso = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : undefined;
  };
  const candidates = new Set<string>();
  let m = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (m) {
    const dm = iso(+m[3], +m[2], +m[1]);
    const md = iso(+m[3], +m[1], +m[2]);
    if (dm) candidates.add(dm);
    if (md) candidates.add(md);
  }
  m = raw.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/) ?? raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) { const v = iso(+m[1], +m[2], +m[3]); if (v) candidates.add(v); }
  if (!candidates.size) return undefined;
  // A value date is within a few days of when the payment arrived.
  const near = [...candidates].sort((a, b) =>
    Math.abs(Date.parse(a) - ctx.receivedAt.getTime()) - Math.abs(Date.parse(b) - ctx.receivedAt.getTime()));
  const plausible = near.filter((d) => Math.abs(Date.parse(d) - ctx.receivedAt.getTime()) < 10 * 86_400_000);
  const confident = plausible.length === 1;
  return {
    fieldPath: "ValueDate", oldValue: raw, newValue: near[0], source: "rule", confidence: confident ? 0.95 : 0.5,
    reason: confident
      ? `"${raw}" rewritten as ISO date ${near[0]}; it is the only reading close to when the payment arrived.`
      : `"${raw}" could be read more than one way. Check the value date with the client.`,
    options: near.slice(1), resolves: rules,
  };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
