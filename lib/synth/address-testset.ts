// The 150-address test set for the address engine (S3-02). Messier than the
// seeded payments on purpose: old town names, typos, capitals, one-line
// addresses, missing countries and "Attn" noise, across all seven countries.
// Deterministic (its own seed), and each row carries the right town and
// country so accuracy can be measured. No bank record is available here, so
// the engine has to work from the text alone.
import type { CountryCode, PostalAddress } from "@/lib/iso/types";
import { COUNTRY_DISPLAY, makeAddress, toAmbiguousJapaneseLine, toUnstructuredLines } from "./places";
import { Rng } from "./rng";

export interface TestAddress {
  id: string;
  style: string;
  lines: string[];
  town: string;
  country: string;
}

const COUNTRIES: CountryCode[] = ["IN", "JP", "US", "AE", "SG", "DE", "GB"];

const OLD_NAMES: Record<string, string> = {
  Mumbai: "Bombay", Bengaluru: "Bangalore", Chennai: "Madras", Muenchen: "Munich",
  "Frankfurt am Main": "Frankfurt", "New York": "NYC", Pune: "Poona",
};
const ABBREVIATED: Record<string, string> = {
  US: "U.S.A.", AE: "UAE", GB: "U.K.", DE: "Deutschland", IN: "India", JP: "Nippon", SG: "Singapore",
};

/** One-letter typo in the town name (swap two inner letters). */
function typo(town: string, rng: Rng): string {
  if (town.length < 6 || town.includes(" ")) return town;
  const i = rng.int(1, town.length - 3);
  return town.slice(0, i) + town[i + 1] + town[i] + town.slice(i + 2);
}

const STYLES: { style: string; count: number; make: (a: PostalAddress, rng: Rng) => string[] | null }[] = [
  { style: "two lines", count: 20, make: (a) => toUnstructuredLines(a) },
  { style: "one line", count: 20, make: (a) => [toUnstructuredLines(a).join(", ")] },
  { style: "capitals", count: 15, make: (a) => toUnstructuredLines(a).map((l) => l.toUpperCase()) },
  {
    style: "old or English town name", count: 15,
    make: (a) => (OLD_NAMES[a.TwnNm!] ? toUnstructuredLines(a).map((l) => l.replace(a.TwnNm!, OLD_NAMES[a.TwnNm!])) : null),
  },
  {
    style: "country abbreviated", count: 15,
    make: (a) => toUnstructuredLines(a).map((l) => l.replace(COUNTRY_DISPLAY[a.Ctry as CountryCode], ABBREVIATED[a.Ctry!])),
  },
  {
    style: "no country", count: 15,
    make: (a) => (a.Ctry === "SG" ? null : toUnstructuredLines(a).map((l) => l.replace(`, ${COUNTRY_DISPLAY[a.Ctry as CountryCode]}`, "").replace(` ${COUNTRY_DISPLAY[a.Ctry as CountryCode]}`, ""))),
  },
  { style: "Japanese block, no town", count: 15, make: (a) => (a.Ctry === "JP" ? toAmbiguousJapaneseLine(a) : null) },
  {
    style: "typo in town", count: 15,
    make: (a, rng) => {
      const t = typo(a.TwnNm!, rng);
      return t === a.TwnNm ? null : toUnstructuredLines(a).map((l) => l.replace(a.TwnNm!, t));
    },
  },
  {
    style: "attention line", count: 10,
    make: (a) => ["Attn: Accounts Payable", ...toUnstructuredLines(a)],
  },
];

export function addressTestSet(): TestAddress[] {
  const rng = new Rng(150_2026);
  const out: TestAddress[] = [];
  for (const s of STYLES) {
    let made = 0;
    let guard = 0;
    while (made < s.count && guard++ < 2000) {
      const country = s.style.startsWith("Japanese") ? "JP" : rng.pick(COUNTRIES);
      const a = makeAddress(rng, country);
      const lines = s.make(a, rng);
      if (!lines) continue;
      out.push({ id: `ADR-${String(out.length + 1).padStart(3, "0")}`, style: s.style, lines, town: a.TwnNm!, country: a.Ctry! });
      made++;
    }
  }
  // Real towns that are NOT in the reference list: the rules should say "not
  // sure" here rather than guess; this is where the Gemini fallback is tested.
  for (const u of UNLISTED) {
    out.push({ id: `ADR-${String(out.length + 1).padStart(3, "0")}`, style: "town not in reference list", lines: u.lines, town: u.town, country: u.country });
  }
  return out;
}

const UNLISTED: { lines: string[]; town: string; country: string }[] = [
  { lines: ["Plot 14, MIDC Ambad", "Nashik 422010, Maharashtra, India"], town: "Nashik", country: "IN" },
  { lines: ["Unit 6, Wagle Estate Road 16", "Thane West 400604, Maharashtra, India"], town: "Thane", country: "IN" },
  { lines: ["22 AB Road, Vijay Nagar", "Indore 452010, Madhya Pradesh, India"], town: "Indore", country: "IN" },
  { lines: ["2-5-1 Kitaando, Aoi-ku", "Shizuoka 420-0881 Japan"], town: "Shizuoka", country: "JP" },
  { lines: ["1-1-1 Marunouchi, Kita-ku", "Okayama 700-0823 Japan"], town: "Okayama", country: "JP" },
  { lines: ["2400 E Camelback Rd, Suite 300", "Phoenix, AZ 85016, USA"], town: "Phoenix", country: "US" },
  { lines: ["1700 Lincoln St, Floor 12", "Denver, CO 80203, USA"], town: "Denver", country: "US" },
  { lines: ["Petersstrasse 32", "04109 Leipzig, Germany"], town: "Leipzig", country: "DE" },
  { lines: ["Unit 3, Celtic Gateway", "CF11 0SN Cardiff, United Kingdom"], town: "Cardiff", country: "GB" },
  { lines: ["Warehouse 4, Industrial Area 1", "PO Box 64021, Al Ain, United Arab Emirates"], town: "Al Ain", country: "AE" },
];
