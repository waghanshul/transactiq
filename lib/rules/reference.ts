// Builds the rules' reference data from the bundled demo lists (for tests and
// scripts) or from database rows (in the app).
import { BANKS } from "@/lib/reference/banks";
import { CORRIDORS, type Corridor } from "@/lib/reference/corridors";
import { SYNTHETIC_WATCHLIST } from "@/lib/reference/screening";
import type { ReferenceData } from "./types";

export function staticReference(): ReferenceData {
  return {
    corridors: Object.fromEntries(CORRIDORS.map((c) => [c.id, c])),
    bicCountry: new Map(BANKS.map((b) => [b.bic, b.country])),
    watchlist: SYNTHETIC_WATCHLIST.map((w) => ({ name: w.name, aliases: w.aliases })),
  };
}

type CorridorRow = Omit<Corridor, "maxAmount" | "debtorCountries" | "creditorCountry"> & {
  maxAmount: string | number;
  debtorCountries: string[];
  creditorCountry: string;
};

export function referenceFromRows(rows: {
  corridors: CorridorRow[];
  bics: { bic: string; country: string }[];
  watchlist: { name: string; aliases: string[] }[];
}): ReferenceData {
  return {
    corridors: Object.fromEntries(
      rows.corridors.map((c) => [c.id, { ...c, maxAmount: Number(c.maxAmount) } as Corridor]),
    ),
    bicCountry: new Map(rows.bics.map((b) => [b.bic, b.country])),
    watchlist: rows.watchlist,
  };
}
