// Address engine v1 (S3-02): rules only, no network.
// Reads free-text address lines and finds the town, country, postcode and
// state, then returns a CBPR+ hybrid address: TwnNm and Ctry in their own
// fields, the street part in at most two AdrLine of 70 characters.
//
// It works from the text alone. The bank's own record of the party (client
// master or beneficiary record) is only used afterwards, to confirm or
// question the answer, never as the answer itself.
import type { PostalAddress } from "@/lib/iso/types";
import { countryCodeFromName, isCountryCode } from "@/lib/reference/countries";
import {
  IN_PIN_PREFIX, IN_STATES, JP_AMBIGUOUS_WARDS, JP_WARD_TOWN, jpTownFromPostcode, TOWNS, US_STATES, type TownEntry,
} from "@/lib/reference/towns";
import { jaroWinkler } from "@/lib/rules/screening";

export interface AddressAnalysis {
  address?: PostalAddress;
  town?: string;
  country?: string;
  confidence: number;
  /** Plain-English steps: what was found where. */
  evidence: string[];
  /** Problems that lower confidence. */
  doubts: string[];
  /** Other towns that also fit, for the low-confidence options list. */
  alternatives: { town: string; country: string }[];
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STREET_WORDS = /^[\s-]*(road|rd|street|st|marg|highway|hwy|avenue|ave|salai|lane|ln|strasse|blvd|drive|dr)\b/i;

interface Span { line: number; start: number; end: number }
interface TownHit { entry: TownEntry; span: Span; how: "exact" | "alias" | "fuzzy"; matched: string }

/** Every whole-word occurrence of `needle` (folded) in `hay` (folded). */
function findWord(hay: string, needle: string): number[] {
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return out;
    const before = i === 0 ? "" : hay[i - 1];
    const after = hay[i + needle.length] ?? "";
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) out.push(i);
    from = i + 1;
  }
}

function townHits(lines: string[]): TownHit[] {
  const hits: TownHit[] = [];
  lines.forEach((raw, line) => {
    const hay = fold(raw);
    for (const entry of TOWNS) {
      const names = [{ n: entry.name, how: "exact" as const }, ...(entry.aliases ?? []).map((n) => ({ n, how: "alias" as const }))];
      for (const { n, how } of names) {
        for (const start of findWord(hay, fold(n))) {
          const end = start + n.length;
          // "Mumbai-Pune Highway", "Dubai Silicon Oasis": a town name inside a street name is not the town.
          if (STREET_WORDS.test(raw.slice(end))) continue;
          if (/^[\s-]+[A-Za-z]/.test(raw.slice(end)) && raw[end] === "-") continue;
          hits.push({ entry, span: { line, start, end }, how, matched: raw.slice(start, end) });
        }
      }
    }
  });
  // Longest match wins where two overlap ("New York City" over "New York").
  return hits.filter((h) => !hits.some((o) => o !== h && o.span.line === h.span.line &&
    o.span.start <= h.span.start && o.span.end >= h.span.end && o.span.end - o.span.start > h.span.end - h.span.start));
}

/** Single words that are close to a known town ("Mumbay", "Bengaluru" typed "Bengalure"). */
function fuzzyTown(lines: string[]): TownHit | undefined {
  let best: TownHit | undefined;
  let bestScore = 0;
  lines.forEach((raw, line) => {
    for (const m of raw.matchAll(/[A-Za-z][A-Za-z]{4,}/g)) {
      const word = fold(m[0]);
      for (const entry of TOWNS) {
        for (const n of [entry.name, ...(entry.aliases ?? [])]) {
          if (n.includes(" ")) continue;
          const score = jaroWinkler(word, fold(n));
          if (score >= 0.9 && score < 1 && score > bestScore) {
            bestScore = score;
            best = { entry, span: { line, start: m.index!, end: m.index! + m[0].length }, how: "fuzzy", matched: m[0] };
          }
        }
      }
    }
  });
  return best;
}

interface CountryHit { code: string; span: Span; matched: string }

/** Country names, aliases or a final two-letter code, searched from the end. */
function countryHits(lines: string[]): CountryHit[] {
  const hits: CountryHit[] = [];
  lines.forEach((raw, line) => {
    const words = [...raw.matchAll(/[A-Za-z][A-Za-z.]*/g)];
    for (let i = 0; i < words.length; i++) {
      for (let len = 4; len >= 1; len--) {
        if (i + len > words.length) continue;
        const start = words[i].index!;
        const last = words[i + len - 1];
        const end = last.index! + last[0].length;
        const phrase = raw.slice(start, end);
        if (len > 1 && /[,]/.test(phrase)) continue;
        const clean = phrase.replace(/\.$/, "");
        const code = clean.length > 3 || /\./.test(clean) || /^(USA|UAE|UK)$/i.test(clean) ? countryCodeFromName(clean) : undefined;
        if (code) { hits.push({ code, span: { line, start, end }, matched: phrase }); i += len - 1; break; }
      }
    }
  });
  // A bare ISO code only counts as the very last token ("..., 60601 US").
  const lastLine = lines.length - 1;
  const tail = lines[lastLine]?.match(/(?:^|[\s,])([A-Z]{2})\s*$/);
  if (tail && isCountryCode(tail[1]) && !US_STATES.has(tail[1])) {
    const start = lines[lastLine].lastIndexOf(tail[1]);
    hits.push({ code: tail[1], span: { line: lastLine, start, end: start + 2 }, matched: tail[1] });
  }
  return hits;
}

interface PostcodeHit { value: string; countries: string[]; span: Span }

function postcodeHits(lines: string[]): PostcodeHit[] {
  const hits: PostcodeHit[] = [];
  lines.forEach((raw, line) => {
    const push = (m: RegExpMatchArray, group: number, countries: string[]) => {
      const value = m[group];
      const start = m.index! + m[0].indexOf(value);
      hits.push({ value, countries, span: { line, start, end: start + value.length } });
    };
    for (const m of raw.matchAll(/\b(\d{3}-\d{4})\b/g)) push(m, 1, ["JP"]);
    for (const m of raw.matchAll(/\b([A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2})\b/g)) push(m, 1, ["GB"]);
    for (const m of raw.matchAll(/\b([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/g)) if (US_STATES.has(m[1])) push(m, 2, ["US"]);
    for (const m of raw.matchAll(/(?<![\d-])(\d{6})(?![\d-])/g)) {
      if (/box\s*$/i.test(raw.slice(0, m.index))) continue;
      push(m, 1, IN_PIN_PREFIX[m[1].slice(0, 3)] ? ["IN", "SG"] : ["SG", "IN"]);
    }
    for (const m of raw.matchAll(/(?<![\d-])(\d{5})(?![\d-])/g)) {
      if (/box\s*$/i.test(raw.slice(0, m.index))) continue;
      if (hits.some((h) => h.span.line === line && h.span.start <= m.index! && h.span.end >= m.index!)) continue;
      push(m, 1, ["DE", "US"]);
    }
  });
  return hits;
}

/** Removes the given spans from the lines and tidies up what is left. */
function leftover(lines: string[], spans: Span[]): string[] {
  const out = lines.map((raw, line) => {
    let s = raw;
    for (const sp of spans.filter((x) => x.line === line).sort((a, b) => b.start - a.start)) {
      s = s.slice(0, sp.start) + " " + s.slice(sp.end);
    }
    return s;
  });
  const segments = out
    .flatMap((l) => l.split(","))
    .map((seg) => seg.replace(/\s+/g, " ").replace(/^[\s\-–/]+|[\s\-–/]+$/g, "").trim())
    .filter((seg) => seg && !/^(p\.?\s?o\.?\s?box)$/i.test(seg));
  return wrapLines(segments);
}

/** Joins segments into at most two lines of 70 characters, breaking at commas. */
export function wrapLines(segments: string[]): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const seg of segments) {
    const next = cur ? `${cur}, ${seg}` : seg;
    if (next.length <= 70) cur = next;
    else { if (cur) lines.push(cur); cur = seg; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** True when the span is a whole comma-separated part of its line, apart from digits. */
function standalone(lines: string[], sp: Span): boolean {
  const raw = lines[sp.line];
  const segStart = raw.lastIndexOf(",", sp.start - 1) + 1;
  const segEndAt = raw.indexOf(",", sp.end);
  const segEnd = segEndAt < 0 ? raw.length : segEndAt;
  const outside = raw.slice(segStart, sp.start) + raw.slice(sp.end, segEnd);
  return outside.split(/\s+/).every((w) => !w || /\d/.test(w));
}

const later = (a: Span, b: Span) => (a.line !== b.line ? a.line - b.line : a.start - b.start);

/**
 * Finds town and country in free-text lines. `hint` is anything already in a
 * structured field (a TwnNm or Ctry that was filled in correctly).
 */
export function analyseAddressLines(lines: string[], hint: { town?: string; country?: string; postcode?: string } = {}): AddressAnalysis {
  const evidence: string[] = [];
  const doubts: string[] = [];
  const removed: Span[] = [];

  // Country written out ("India", "U.S.A.", "Deutschland").
  const countries = countryHits(lines);
  const explicit = countries.sort((a, b) => later(b.span, a.span))[0];
  for (const c of countries.filter((c) => c.code === explicit?.code)) removed.push(c.span);
  if (explicit) evidence.push(`"${explicit.matched}" is the country ${explicit.code}`);

  // Town from the gazetteer, the last mention wins (the town line comes after the street).
  let towns = townHits(lines);
  if (explicit) {
    const inCountry = towns.filter((t) => t.entry.country === explicit.code);
    if (inCountry.length) towns = inCountry;
  }
  let town = towns.sort((a, b) => later(b.span, a.span))[0];
  // A Japanese postcode names the city more reliably than a near-miss spelling
  // ("Osaki" is a Tokyo district, not a typo for Osaka).
  const jpPostcodeTown = postcodeHits(lines).some((p) => p.countries[0] === "JP" && jpTownFromPostcode(p.value));
  if (!town && !jpPostcodeTown) {
    const fuzzy = fuzzyTown(lines);
    if (fuzzy && (!explicit || fuzzy.entry.country === explicit.code)) town = fuzzy;
  }
  let townName = town?.entry.name ?? hint.town;
  let townConf = town ? { exact: 0.95, alias: 0.9, fuzzy: 0.72 }[town.how] : hint.town ? 0.9 : 0;
  if (town) {
    removed.push(town.span);
    // Remove other mentions of the same town on its own (e.g. "Singapore 123456, Singapore").
    for (const t of towns) if (t.entry.name === town.entry.name && t !== town && standalone(lines, t.span)) removed.push(t.span);
    evidence.push(
      town.how === "exact" ? `"${town.matched}" is a known town in ${town.entry.country}`
        : town.how === "alias" ? `"${town.matched}" is another name for ${town.entry.name}`
          : `"${town.matched}" looks like a misspelling of ${town.entry.name}`,
    );
    if (town.how === "fuzzy") doubts.push(`"${town.matched}" is not an exact town name`);
  }

  // Postcodes.
  const posts = postcodeHits(lines);
  let postcode = hint.postcode;
  let postCountry: string | undefined;
  const wanted = explicit?.code ?? town?.entry.country;
  const post = posts.find((p) => wanted && p.countries.includes(wanted)) ?? (wanted ? undefined : posts[0]);
  if (post) {
    postcode = post.value;
    postCountry = wanted && post.countries.includes(wanted) ? wanted : post.countries[0];
    removed.push(post.span);
  }

  // Japan and India: town from postcode or ward when the town name is absent.
  const jpPost = posts.find((p) => p.countries[0] === "JP");
  const wardCities: string[] = [];
  if (!town && jpPost) {
    const fromPost = jpTownFromPostcode(jpPost.value);
    const ward = lines.join(" ").match(/\b([A-Za-z]+-ku)\b/i)?.[1];
    const fromWard = ward ? JP_WARD_TOWN[ward.toLowerCase()] : undefined;
    const shared = ward ? JP_AMBIGUOUS_WARDS[ward.toLowerCase()] : undefined;
    if (shared) {
      wardCities.push(...shared);
      doubts.push(`${ward} is a ward name in ${shared.join(", ")}`);
    }
    if (fromPost) {
      townName = fromPost;
      townConf = fromWard === fromPost ? 0.88 : fromWard ? 0.5 : 0.68;
      evidence.push(`postcode ${jpPost.value} is in ${fromPost}`);
      if (!fromWard) doubts.push(`no town name in the text; ${fromPost} is only inferred from the postcode`);
      if (fromWard === fromPost) evidence.push(`${ward} is a ward of ${fromPost}`);
      if (fromWard && fromWard !== fromPost) doubts.push(`${ward} points to ${fromWard}, but the postcode points to ${fromPost}`);
      postcode = jpPost.value;
      postCountry = "JP";
    } else if (fromWard) {
      townName = fromWard;
      townConf = 0.6;
      evidence.push(`${ward} is a ward of ${fromWard}`);
    }
  }
  const pin = posts.find((p) => p.countries.includes("IN") && IN_PIN_PREFIX[p.value.slice(0, 3)]);
  if (!town && !jpPost && pin && (!explicit || explicit.code === "IN")) {
    townName = IN_PIN_PREFIX[pin.value.slice(0, 3)];
    // A PIN prefix covers a whole district (Thane shares 400 with Mumbai): a hint, not an answer.
    townConf = 0.65;
    doubts.push(`no town name in the text; ${townName} is only inferred from the PIN code`);
    postcode = pin.value;
    postCountry = "IN";
    evidence.push(`PIN code ${pin.value} is in ${townName}`);
    if (!removed.includes(pin.span)) removed.push(pin.span);
  }

  // Decide the country.
  const townCountry = town?.entry.country ?? (townName ? TOWNS.find((t) => t.name === townName)?.country : undefined);
  let country = explicit?.code ?? hint.country;
  let countryConf = explicit ? 0.97 : hint.country ? 0.9 : 0;
  if (!country && townCountry) { country = townCountry; countryConf = Math.min(0.92, townConf); evidence.push(`${townName} is in ${townCountry}`); }
  if (!country && postCountry) { country = postCountry; countryConf = postCountry === "JP" || postCountry === "GB" ? 0.8 : 0.45; evidence.push(`postcode shape matches ${postCountry}`); }
  if (country && townCountry && country !== townCountry) {
    doubts.push(`the text names ${country} but ${townName} is in ${townCountry}`);
    countryConf = Math.min(countryConf, 0.4);
    townConf = Math.min(townConf, 0.4);
  }

  // State or prefecture.
  let subdivision: string | undefined;
  const joined = lines.join(", ");
  const inState = IN_STATES.find((s) => findWord(fold(joined), fold(s)).length);
  if (country === "IN" && inState) {
    subdivision = inState;
    lines.forEach((raw, line) => {
      for (const start of findWord(fold(raw), fold(inState))) removed.push({ line, start, end: start + inState.length });
    });
  }
  if (country === "US") {
    lines.forEach((raw, line) => {
      const m = raw.match(/\b([A-Z]{2})\s+\d{5}/);
      if (m && US_STATES.has(m[1])) { subdivision = m[1]; removed.push({ line, start: m.index!, end: m.index! + 2 }); }
    });
  }

  // PO Box (common in the UAE).
  let poBox: string | undefined;
  lines.forEach((raw, line) => {
    const m = raw.match(/\bP\.?\s?O\.?\s?Box\s*(\d+)/i);
    if (m) { poBox = m[1]; removed.push({ line, start: m.index!, end: m.index! + m[0].length }); }
  });

  if (!townName || !country) {
    if (!townName) doubts.push("no town found in the text");
    if (!country) doubts.push("no country found in the text");
    return {
      confidence: 0, evidence, doubts, town: townName, country,
      alternatives: towns.slice(0, 3).map((t) => ({ town: t.entry.name, country: t.entry.country })),
    };
  }

  const rest = leftover(lines, removed);
  if (rest.length > 2) doubts.push("the street part is longer than two lines of 70 characters");
  const address: PostalAddress = {
    ...(poBox ? { PstBx: poBox } : {}),
    ...(postcode ? { PstCd: postcode } : {}),
    TwnNm: townName,
    ...(subdivision ? { CtrySubDvsn: subdivision } : {}),
    Ctry: country,
    ...(rest.length ? { AdrLine: rest.slice(0, 2) } : {}),
  };

  let confidence = Math.min(townConf, countryConf);
  if (rest.length > 2) confidence = Math.min(confidence, 0.5);
  const alternatives = [
    ...towns.map((t) => ({ town: t.entry.name, country: t.entry.country })),
    ...wardCities.map((c) => ({ town: c, country: "JP" })),
  ].filter((t, i, all) => t.town !== townName && all.findIndex((x) => x.town === t.town) === i);
  return { address, town: townName, country, confidence: round(confidence), evidence, doubts, alternatives };
}

export const round = (n: number) => Math.round(n * 100) / 100;


const same = (a?: string, b?: string) => !!a && !!b && fold(a) === fold(b);

/**
 * Compares the engine's answer with the bank's own record of the party.
 * Agreement raises confidence; disagreement lowers it and says why.
 */
export function crossCheckWithRecord(
  a: AddressAnalysis,
  record: PostalAddress | undefined,
  label: string,
): AddressAnalysis {
  if (!record?.TwnNm || !record.Ctry || !a.address) return a;
  if (same(a.town, record.TwnNm) && a.country === record.Ctry) {
    return { ...a, confidence: round(Math.max(a.confidence, 0.97)), evidence: [...a.evidence, `matches the ${label} on file`] };
  }
  return {
    ...a,
    confidence: round(Math.min(a.confidence, 0.55)),
    doubts: [...a.doubts, `the ${label} on file says ${record.TwnNm}, ${record.Ctry}`],
    alternatives: [{ town: record.TwnNm, country: record.Ctry }, ...a.alternatives],
  };
}
