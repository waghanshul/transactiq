// Synthetic BIC directory. Every bank here is fictitious.
// Each BIC's 8th character is "0", which in the BIC standard marks a test and
// training code that is never used for live payments, so none of these can
// collide with a real bank's live BIC. Run `npm run import:gleif` to add real
// BICs (source "gleif") from the free GLEIF BIC-to-LEI file if you want them.
import type { CountryCode } from "@/lib/iso/types";

export interface Bank {
  bic: string;
  name: string;
  city: string;
  country: CountryCode;
  /** Role in the demo: the originating bank sends; beneficiary banks receive. */
  role: "originating" | "beneficiary";
}

export const BANKS: Bank[] = [
  // Originating bank branches (the bank whose ops team uses the tool)
  { bic: "SYNOJPT0", name: "Synthetic Originating Bank, Tokyo", city: "Tokyo", country: "JP", role: "originating" },
  { bic: "SYNOUS30", name: "Synthetic Originating Bank, New York", city: "New York", country: "US", role: "originating" },
  { bic: "SYNODEF0", name: "Synthetic Originating Bank, Frankfurt", city: "Frankfurt am Main", country: "DE", role: "originating" },
  { bic: "SYNOGB20", name: "Synthetic Originating Bank, London", city: "London", country: "GB", role: "originating" },

  // Beneficiary banks
  { bic: "DECCINP0", name: "Deccan Commercial Bank", city: "Pune", country: "IN", role: "beneficiary" },
  { bic: "KONKINB0", name: "Konkan Merchants Bank", city: "Mumbai", country: "IN", role: "beneficiary" },
  { bic: "KAVRINC0", name: "Kaveri Trust Bank", city: "Chennai", country: "IN", role: "beneficiary" },
  { bic: "HIKRJPT0", name: "Hikari Trust Bank", city: "Tokyo", country: "JP", role: "beneficiary" },
  { bic: "NANIJPO0", name: "Naniwa Commercial Bank", city: "Osaka", country: "JP", role: "beneficiary" },
  { bic: "LKSHUS40", name: "Lakeshore National Bank", city: "Chicago", country: "US", role: "beneficiary" },
  { bic: "GULFUS50", name: "Gulfport Savings Bank", city: "Houston", country: "US", role: "beneficiary" },
  { bic: "HDSNUS30", name: "Hudson Union Bank", city: "New York", country: "US", role: "beneficiary" },
  { bic: "CRKSAED0", name: "Creekside Bank", city: "Dubai", country: "AE", role: "beneficiary" },
  { bic: "FALCAEA0", name: "Falcon Gulf Bank", city: "Abu Dhabi", country: "AE", role: "beneficiary" },
  { bic: "MRLNSGS0", name: "Merlion Merchant Bank", city: "Singapore", country: "SG", role: "beneficiary" },
  { bic: "STRTSGS0", name: "Straits Union Bank", city: "Singapore", country: "SG", role: "beneficiary" },
];

export const ORIGINATING_BIC: Record<string, string> = {
  JP: "SYNOJPT0",
  US: "SYNOUS30",
  DE: "SYNODEF0",
  GB: "SYNOGB20",
};

export function beneficiaryBanks(country: CountryCode): Bank[] {
  return BANKS.filter((b) => b.role === "beneficiary" && b.country === country);
}
