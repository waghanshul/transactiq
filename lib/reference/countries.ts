// ISO 3166-1 alpha-2 country codes and English names, bundled from the
// i18n-iso-countries package so no network call is needed.
import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";

countries.registerLocale(en);

export interface Country {
  code: string;
  name: string;
}

export const COUNTRIES: Country[] = Object.entries(countries.getNames("en", { select: "official" }))
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.code.localeCompare(b.code));

const CODE_SET = new Set(COUNTRIES.map((c) => c.code));

export function isCountryCode(value: string | undefined): boolean {
  return value !== undefined && CODE_SET.has(value);
}

/** Resolves a country name or common alias ("India", "USA", "UAE") to its alpha-2 code. */
export function countryCodeFromName(name: string): string | undefined {
  return countries.getAlpha2Code(name, "en") ?? ALIASES[name.trim().toUpperCase()];
}

const ALIASES: Record<string, string> = {
  USA: "US", "U.S.A.": "US", "UNITED STATES": "US", UK: "GB", "U.K.": "GB",
  UAE: "AE", "U.A.E.": "AE", NIPPON: "JP", DEUTSCHLAND: "DE", BHARAT: "IN",
};
