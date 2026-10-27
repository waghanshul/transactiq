// The six payment corridors in the POC. Values marked `illustrative` are
// plausible demo settings, not sourced bank or regulatory rules; confirm
// against the bank's own corridor rules before any real use.
import type { CountryCode } from "@/lib/iso/types";

export interface Corridor {
  id: string;
  label: string;
  debtorCountries: CountryCode[];
  creditorCountry: CountryCode;
  /** Currency the payment is sent in. */
  currency: string;
  /** Currencies the corridor accepts; anything else is AM03. */
  allowedCurrencies: string[];
  purposeRequired: boolean;
  /** Single-payment maximum in `currency`; above it is AM02. */
  maxAmount: number;
  /** Payment cut-off, hour of day in UTC. */
  cutoffHourUtc: number;
  notes: string;
  illustrative: boolean;
}

export const CORRIDORS: Corridor[] = [
  {
    id: "USD-INR", label: "USD to INR", debtorCountries: ["US", "JP"], creditorCountry: "IN",
    currency: "USD", allowedCurrencies: ["USD", "EUR", "GBP", "JPY"], purposeRequired: true,
    maxAmount: 2_500_000, cutoffHourUtc: 9,
    notes: "Inward remittances to India must state a purpose; mapped to ISO purpose codes here. INR is not accepted as a cross-border sending currency in this demo.",
    illustrative: true,
  },
  {
    id: "JPY-USD", label: "JPY to USD", debtorCountries: ["JP"], creditorCountry: "US",
    currency: "USD", allowedCurrencies: ["USD", "JPY"], purposeRequired: false,
    maxAmount: 10_000_000, cutoffHourUtc: 21,
    notes: "Japanese clients paying US suppliers in USD.",
    illustrative: true,
  },
  {
    id: "USD-AED", label: "USD to AED", debtorCountries: ["US"], creditorCountry: "AE",
    currency: "USD", allowedCurrencies: ["USD", "AED", "EUR"], purposeRequired: true,
    maxAmount: 3_000_000, cutoffHourUtc: 10,
    notes: "UAE beneficiaries expect a purpose of payment; mapped to ISO purpose codes here.",
    illustrative: true,
  },
  {
    id: "EUR-SGD", label: "EUR to SGD", debtorCountries: ["DE"], creditorCountry: "SG",
    currency: "EUR", allowedCurrencies: ["EUR", "SGD", "USD"], purposeRequired: false,
    maxAmount: 5_000_000, cutoffHourUtc: 8,
    notes: "German clients paying Singapore suppliers.",
    illustrative: true,
  },
  {
    id: "USD-JPY", label: "USD to JPY", debtorCountries: ["US"], creditorCountry: "JP",
    currency: "JPY", allowedCurrencies: ["JPY", "USD"], purposeRequired: false,
    maxAmount: 500_000_000, cutoffHourUtc: 5,
    notes: "JPY has no minor unit, so amounts must be whole numbers.",
    illustrative: true,
  },
  {
    id: "GBP-USD", label: "GBP to USD", debtorCountries: ["GB"], creditorCountry: "US",
    currency: "USD", allowedCurrencies: ["USD", "GBP"], purposeRequired: false,
    maxAmount: 8_000_000, cutoffHourUtc: 20,
    notes: "UK clients paying US suppliers in USD.",
    illustrative: true,
  },
];

export const CORRIDOR_BY_ID = Object.fromEntries(CORRIDORS.map((c) => [c.id, c])) as Record<string, Corridor>;

/** Currencies with no minor unit (ISO 4217 exponent 0) used in the demo. */
export const ZERO_DECIMAL_CURRENCIES = new Set(["JPY"]);
