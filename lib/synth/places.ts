// Fictitious but realistically formatted addresses for the seven demo countries,
// following the Swift structured-address country conventions in spirit:
// town and country always in their own fields, the rest structured where the
// country's addressing allows. All values use the CBPR+ Latin character set.
import type { CountryCode, PostalAddress } from "@/lib/iso/types";
import type { Rng } from "./rng";

interface Town {
  town: string;
  subdivision?: string;
  postcode: (rng: Rng) => string;
  streets: string[];
  /** Japanese addresses: ward (ku) -> neighbourhoods. */
  wards?: Record<string, string[]>;
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");

const TOWNS: Record<CountryCode, Town[]> = {
  IN: [
    { town: "Pune", subdivision: "Maharashtra", postcode: (r) => `4110${pad(r.int(1, 62), 2)}`, streets: ["MG Road", "Senapati Bapat Road", "Baner Road", "Mumbai-Pune Highway", "Hinjewadi Phase 2 Road"] },
    { town: "Mumbai", subdivision: "Maharashtra", postcode: (r) => `4000${pad(r.int(1, 99), 2)}`, streets: ["Linking Road", "LBS Marg", "Andheri-Kurla Road", "Dr Annie Besant Road"] },
    { town: "Chennai", subdivision: "Tamil Nadu", postcode: (r) => `600${pad(r.int(1, 119), 3)}`, streets: ["Anna Salai", "Rajiv Gandhi Salai", "GST Road"] },
    { town: "Bengaluru", subdivision: "Karnataka", postcode: (r) => `5600${pad(r.int(1, 99), 2)}`, streets: ["Residency Road", "Hosur Road", "Outer Ring Road"] },
    { town: "Ahmedabad", subdivision: "Gujarat", postcode: (r) => `3800${pad(r.int(1, 61), 2)}`, streets: ["CG Road", "SG Highway", "Ashram Road"] },
    { town: "Coimbatore", subdivision: "Tamil Nadu", postcode: (r) => `6410${pad(r.int(1, 48), 2)}`, streets: ["Avinashi Road", "Trichy Road"] },
  ],
  JP: [
    { town: "Tokyo", postcode: (r) => `1${pad(r.int(0, 99), 2)}-${pad(r.int(0, 9999), 4)}`, streets: [], wards: { "Chiyoda-ku": ["Otemachi", "Marunouchi"], "Minato-ku": ["Shiba", "Akasaka"], "Chuo-ku": ["Nihonbashi", "Ginza"], "Shinagawa-ku": ["Osaki"] } },
    { town: "Osaka", postcode: (r) => `53${r.int(0, 9)}-${pad(r.int(0, 9999), 4)}`, streets: [], wards: { "Kita-ku": ["Umeda"], "Chuo-ku": ["Honmachi"] } },
    { town: "Nagoya", postcode: (r) => `460-${pad(r.int(0, 9999), 4)}`, streets: [], wards: { "Naka-ku": ["Sakae"] } },
    { town: "Yokohama", postcode: (r) => `220-${pad(r.int(0, 9999), 4)}`, streets: [], wards: { "Nishi-ku": ["Minatomirai"] } },
    { town: "Hamamatsu", postcode: (r) => `430-${pad(r.int(0, 9999), 4)}`, streets: [], wards: { "Naka-ku": ["Itaya-machi"] } },
  ],
  US: [
    { town: "Chicago", subdivision: "IL", postcode: (r) => `606${pad(r.int(1, 99), 2)}`, streets: ["W Madison St", "N Wacker Dr", "S Canal St"] },
    { town: "Houston", subdivision: "TX", postcode: (r) => `770${pad(r.int(1, 99), 2)}`, streets: ["Louisiana St", "Westheimer Rd", "Navigation Blvd"] },
    { town: "New York", subdivision: "NY", postcode: (r) => `100${pad(r.int(1, 99), 2)}`, streets: ["Park Ave", "W 34th St", "Broadway"] },
    { town: "Atlanta", subdivision: "GA", postcode: (r) => `303${pad(r.int(1, 99), 2)}`, streets: ["Peachtree St NE", "Marietta St NW"] },
    { town: "San Jose", subdivision: "CA", postcode: (r) => `951${pad(r.int(1, 99), 2)}`, streets: ["N First St", "Zanker Rd"] },
    { town: "Detroit", subdivision: "MI", postcode: (r) => `482${pad(r.int(1, 99), 2)}`, streets: ["Woodward Ave", "Michigan Ave"] },
  ],
  AE: [
    { town: "Dubai", postcode: () => "", streets: ["Jebel Ali Free Zone", "Al Quoz Industrial Area 3", "Dubai Silicon Oasis"] },
    { town: "Abu Dhabi", postcode: () => "", streets: ["Mussafah Industrial Area", "Khalifa Industrial Zone"] },
    { town: "Sharjah", postcode: () => "", streets: ["Hamriyah Free Zone", "Industrial Area 6"] },
  ],
  SG: [
    { town: "Singapore", postcode: (r) => pad(r.int(100000, 829999), 6), streets: ["Pioneer Road", "Jurong Port Road", "Tuas Avenue 8", "Ubi Avenue 1", "Kallang Way"] },
  ],
  DE: [
    { town: "Stuttgart", postcode: (r) => `70${pad(r.int(173, 629), 3)}`, streets: ["Koenigstrasse", "Heilbronner Strasse"] },
    { town: "Muenchen", postcode: (r) => `80${pad(r.int(331, 999), 3)}`, streets: ["Leopoldstrasse", "Landsberger Strasse"] },
    { town: "Frankfurt am Main", postcode: (r) => `60${pad(r.int(306, 599), 3)}`, streets: ["Mainzer Landstrasse", "Hanauer Landstrasse"] },
  ],
  GB: [
    { town: "London", postcode: (r) => `EC2V ${r.int(1, 9)}${r.pick(["AB", "BQ", "DY", "HN"])}`, streets: ["Gresham Street", "Moorgate"] },
    { town: "Reading", postcode: (r) => `RG1 ${r.int(1, 9)}${r.pick(["AA", "DN", "LR"])}`, streets: ["Kings Road", "Forbury Road"] },
    { town: "Manchester", postcode: (r) => `M3 ${r.int(1, 9)}${r.pick(["AJ", "BW", "EB"])}`, streets: ["Deansgate", "Quay Street"] },
  ],
};

const BUILDINGS = ["Phoenix House", "Shivneri Industrial Estate", "Crescent Tower", "Harbour Point", "Riverside Park", "Unity Plaza", "Summit Centre", "Lakeview Business Park"];

export const COUNTRY_DISPLAY: Record<CountryCode, string> = {
  IN: "India", JP: "Japan", US: "USA", AE: "United Arab Emirates", SG: "Singapore", DE: "Germany", GB: "United Kingdom",
};

/** A clean, fully structured address in `country`. Optionally pinned to a town. */
export function makeAddress(rng: Rng, country: CountryCode, townName?: string): PostalAddress {
  const towns = TOWNS[country];
  const t = (townName && towns.find((x) => x.town === townName)) || rng.pick(towns);

  switch (country) {
    case "JP": {
      const ward = rng.pick(Object.keys(t.wards!));
      return {
        StrtNm: rng.pick(t.wards![ward]),
        BldgNb: `${rng.int(1, 4)}-${rng.int(1, 9)}-${rng.int(1, 12)}`,
        PstCd: t.postcode(rng),
        TwnNm: t.town,
        DstrctNm: ward,
        Ctry: "JP",
      };
    }
    case "AE":
      return {
        StrtNm: rng.pick(t.streets),
        BldgNm: `Warehouse ${rng.int(1, 40)}`,
        PstBx: String(rng.int(10000, 299999)),
        TwnNm: t.town,
        Ctry: "AE",
      };
    case "IN":
      return {
        StrtNm: rng.pick(t.streets),
        BldgNb: String(rng.int(1, 220)),
        BldgNm: rng.pick(BUILDINGS),
        Flr: String(rng.int(1, 9)),
        PstCd: t.postcode(rng),
        TwnNm: t.town,
        CtrySubDvsn: t.subdivision,
        Ctry: "IN",
      };
    case "US":
      return {
        StrtNm: rng.pick(t.streets),
        BldgNb: String(rng.int(100, 2999)),
        Flr: String(rng.int(2, 40)),
        PstCd: t.postcode(rng),
        TwnNm: t.town,
        CtrySubDvsn: t.subdivision,
        Ctry: "US",
      };
    default:
      return {
        StrtNm: rng.pick(t.streets),
        BldgNb: String(rng.int(1, 180)),
        PstCd: t.postcode(rng),
        TwnNm: t.town,
        Ctry: country,
      };
  }
}

/** Renders a structured address as legacy free-text lines (the pre-2026 habit). */
export function toUnstructuredLines(a: PostalAddress): string[] {
  const country = COUNTRY_DISPLAY[a.Ctry as CountryCode] ?? a.Ctry ?? "";
  switch (a.Ctry) {
    case "JP":
      return [`${a.BldgNb} ${a.StrtNm}, ${a.DstrctNm}`, `${a.TwnNm} ${a.PstCd} ${country}`];
    case "IN":
      return [`Floor ${a.Flr}, ${a.BldgNm}, ${a.BldgNb} ${a.StrtNm}`, `${a.TwnNm} ${a.PstCd}, ${a.CtrySubDvsn}, ${country}`];
    case "US":
      return [`${a.BldgNb} ${a.StrtNm}, Suite ${a.Flr}00`, `${a.TwnNm}, ${a.CtrySubDvsn} ${a.PstCd}, ${country}`];
    case "AE":
      return [`${a.BldgNm}, ${a.StrtNm}`, `PO Box ${a.PstBx}, ${a.TwnNm}, ${country}`];
    default:
      return [`${a.BldgNb} ${a.StrtNm}`, `${a.PstCd} ${a.TwnNm}, ${country}`];
  }
}

/** Street-level part of an address as one hybrid AdrLine (no town or country). */
export function streetLine(a: PostalAddress): string {
  return [a.Flr ? `Floor ${a.Flr}` : undefined, a.BldgNm, [a.BldgNb, a.StrtNm].filter(Boolean).join(" "), a.DstrctNm]
    .filter(Boolean)
    .join(", ");
}

/** Hard case: a Japanese block address with no town or country words at all. */
export function toAmbiguousJapaneseLine(a: PostalAddress): string[] {
  return [`${a.BldgNb} ${a.StrtNm} ${a.DstrctNm} ${a.PstCd}`];
}
