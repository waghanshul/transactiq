// Towns and postcode patterns for the corridor countries, used by the address
// engine to find the town and country in free-text address lines.
//
// This is a hand-picked subset of the GeoNames "cities15000" list (CC BY 4.0,
// geonames.org), limited to the seven corridor countries, plus the common
// historic or English names people still type (Bombay, Munich, Madras).
// Postcode prefixes are from India Post's PIN code zones and Japan Post's
// postcode ranges. Swap in the full GeoNames dump for production.

export interface TownEntry {
  /** Spelling used in the TwnNm field (CBPR+ Latin character set). */
  name: string;
  country: string;
  /** Other spellings people use. Matched case- and accent-insensitively. */
  aliases?: string[];
  /** State or prefecture, for CtrySubDvsn. */
  subdivision?: string;
}

export const TOWNS: TownEntry[] = [
  // India
  { name: "Pune", country: "IN", aliases: ["Poona"], subdivision: "Maharashtra" },
  { name: "Mumbai", country: "IN", aliases: ["Bombay"], subdivision: "Maharashtra" },
  { name: "Chennai", country: "IN", aliases: ["Madras"], subdivision: "Tamil Nadu" },
  { name: "Bengaluru", country: "IN", aliases: ["Bangalore"], subdivision: "Karnataka" },
  { name: "Ahmedabad", country: "IN", aliases: ["Amdavad"], subdivision: "Gujarat" },
  { name: "Coimbatore", country: "IN", subdivision: "Tamil Nadu" },
  { name: "New Delhi", country: "IN", aliases: ["Delhi"], subdivision: "Delhi" },
  { name: "Hyderabad", country: "IN", subdivision: "Telangana" },
  { name: "Kolkata", country: "IN", aliases: ["Calcutta"], subdivision: "West Bengal" },
  { name: "Gurugram", country: "IN", aliases: ["Gurgaon"], subdivision: "Haryana" },
  { name: "Noida", country: "IN", subdivision: "Uttar Pradesh" },
  { name: "Jaipur", country: "IN", subdivision: "Rajasthan" },
  { name: "Surat", country: "IN", subdivision: "Gujarat" },
  { name: "Nagpur", country: "IN", subdivision: "Maharashtra" },
  { name: "Kochi", country: "IN", aliases: ["Cochin"], subdivision: "Kerala" },
  { name: "Vadodara", country: "IN", aliases: ["Baroda"], subdivision: "Gujarat" },
  // Japan
  { name: "Tokyo", country: "JP", aliases: ["Tokio"] },
  { name: "Osaka", country: "JP" },
  { name: "Nagoya", country: "JP" },
  { name: "Yokohama", country: "JP" },
  { name: "Hamamatsu", country: "JP" },
  { name: "Kyoto", country: "JP" },
  { name: "Kobe", country: "JP" },
  { name: "Fukuoka", country: "JP" },
  { name: "Sapporo", country: "JP" },
  { name: "Sendai", country: "JP" },
  { name: "Kawasaki", country: "JP" },
  { name: "Hiroshima", country: "JP" },
  // United States
  { name: "Chicago", country: "US", subdivision: "IL" },
  { name: "Houston", country: "US", subdivision: "TX" },
  { name: "New York", country: "US", aliases: ["New York City", "NYC"], subdivision: "NY" },
  { name: "Atlanta", country: "US", subdivision: "GA" },
  { name: "San Jose", country: "US", subdivision: "CA" },
  { name: "Detroit", country: "US", subdivision: "MI" },
  { name: "Los Angeles", country: "US", subdivision: "CA" },
  { name: "San Francisco", country: "US", subdivision: "CA" },
  { name: "Seattle", country: "US", subdivision: "WA" },
  { name: "Dallas", country: "US", subdivision: "TX" },
  { name: "Boston", country: "US", subdivision: "MA" },
  { name: "Miami", country: "US", subdivision: "FL" },
  { name: "Newark", country: "US", subdivision: "NJ" },
  // United Arab Emirates
  { name: "Dubai", country: "AE" },
  { name: "Abu Dhabi", country: "AE" },
  { name: "Sharjah", country: "AE" },
  { name: "Ajman", country: "AE" },
  { name: "Ras Al Khaimah", country: "AE" },
  { name: "Fujairah", country: "AE" },
  // Singapore
  { name: "Singapore", country: "SG" },
  // Germany (TwnNm without umlauts, as CBPR+ Latin text)
  { name: "Stuttgart", country: "DE" },
  { name: "Muenchen", country: "DE", aliases: ["Munich", "München", "Munchen"] },
  { name: "Frankfurt am Main", country: "DE", aliases: ["Frankfurt", "Frankfurt/Main", "Frankfurt a.M."] },
  { name: "Berlin", country: "DE" },
  { name: "Hamburg", country: "DE" },
  { name: "Koeln", country: "DE", aliases: ["Cologne", "Köln", "Koln"] },
  { name: "Duesseldorf", country: "DE", aliases: ["Düsseldorf", "Dusseldorf"] },
  // United Kingdom
  { name: "London", country: "GB" },
  { name: "Reading", country: "GB" },
  { name: "Manchester", country: "GB" },
  { name: "Birmingham", country: "GB" },
  { name: "Leeds", country: "GB" },
  { name: "Glasgow", country: "GB" },
  { name: "Edinburgh", country: "GB" },
  { name: "Bristol", country: "GB" },
];

/** India PIN code: first three digits to the main town of that sorting district. */
export const IN_PIN_PREFIX: Record<string, string> = {
  "411": "Pune", "412": "Pune", "400": "Mumbai", "600": "Chennai", "560": "Bengaluru",
  "380": "Ahmedabad", "641": "Coimbatore", "110": "New Delhi", "500": "Hyderabad",
  "700": "Kolkata", "122": "Gurugram", "201": "Noida", "302": "Jaipur", "395": "Surat",
  "440": "Nagpur", "682": "Kochi", "390": "Vadodara",
};

/** Japan postcode: first three digits to city, for the cities above. */
export function jpTownFromPostcode(postcode: string): string | undefined {
  const p = Number(postcode.slice(0, 3));
  if (p >= 100 && p <= 209) return "Tokyo";
  if (p >= 220 && p <= 247) return "Yokohama";
  if (p >= 210 && p <= 216) return "Kawasaki";
  if (p >= 530 && p <= 559) return "Osaka";
  if (p >= 450 && p <= 468) return "Nagoya";
  if (p >= 430 && p <= 435) return "Hamamatsu";
  if (p >= 600 && p <= 616) return "Kyoto";
  if (p >= 650 && p <= 658) return "Kobe";
  if (p >= 810 && p <= 819) return "Fukuoka";
  if (p >= 60 && p <= 65) return "Sapporo";
  if (p >= 980 && p <= 989) return "Sendai";
  if (p >= 730 && p <= 739) return "Hiroshima";
  return undefined;
}

/** Japanese wards (ku) that exist in only one of the cities above. */
export const JP_WARD_TOWN: Record<string, string> = {
  "chiyoda-ku": "Tokyo", "minato-ku": "Tokyo", "shinagawa-ku": "Tokyo", "shinjuku-ku": "Tokyo",
  "shibuya-ku": "Tokyo", "taito-ku": "Tokyo", "koto-ku": "Tokyo", "bunkyo-ku": "Tokyo",
  "tennoji-ku": "Osaka", "yodogawa-ku": "Osaka", "nakamura-ku": "Nagoya", "atsuta-ku": "Nagoya",
  "kohoku-ku": "Yokohama", "tsurumi-ku": "Yokohama",
};

/** Ward names used in more than one of the cities above. */
export const JP_AMBIGUOUS_WARDS: Record<string, string[]> = {
  "chuo-ku": ["Tokyo", "Osaka", "Kobe", "Sapporo", "Fukuoka"],
  "kita-ku": ["Tokyo", "Osaka", "Nagoya", "Kyoto", "Kobe"],
  "naka-ku": ["Nagoya", "Hamamatsu", "Yokohama", "Hiroshima"],
  "nishi-ku": ["Yokohama", "Osaka", "Nagoya", "Fukuoka", "Hamamatsu"],
  "minami-ku": ["Yokohama", "Kyoto", "Fukuoka", "Hiroshima"],
};

/** US state and territory abbreviations, for "City, ST 12345" lines. */
export const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
  "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR",
  "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

/** Indian states and union territories that appear in addresses. */
export const IN_STATES = [
  "Maharashtra", "Tamil Nadu", "Karnataka", "Gujarat", "Delhi", "Telangana", "West Bengal", "Haryana",
  "Uttar Pradesh", "Rajasthan", "Kerala", "Andhra Pradesh", "Punjab", "Madhya Pradesh",
];

/** Postcode shapes. Several countries share a shape, so a match is a hint, not proof. */
export const POSTCODE_PATTERNS: { country: string; re: RegExp }[] = [
  { country: "JP", re: /\b(\d{3}-\d{4})\b/ },
  { country: "GB", re: /\b([A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2})\b/ },
  { country: "US", re: /\b[A-Z]{2}\s+(\d{5}(?:-\d{4})?)\b/ },
  { country: "IN", re: /\b([1-9]\d{5})\b/ },
  { country: "SG", re: /\b(\d{6})\b/ },
  { country: "DE", re: /\b(\d{5})\b/ },
];
