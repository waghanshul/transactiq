// Fictitious corporate clients (the bank's customers who send payments) and
// their suppliers (the beneficiaries). None of these are real companies.
import { composeIBAN } from "ibantools";
import type { Account, CountryCode, PostalAddress } from "@/lib/iso/types";
import { beneficiaryBanks, ORIGINATING_BIC } from "@/lib/reference/banks";
import { CORRIDOR_BY_ID } from "@/lib/reference/corridors";
import { makeAddress } from "./places";
import type { Rng } from "./rng";

export type Channel = "host-to-host" | "e-banking" | "api";

export interface Client {
  id: string;
  name: string;
  shortCode: string;
  country: CountryCode;
  town: string;
  channel: Channel;
  corridors: string[];
  /** Relative share of payment volume. */
  volume: number;
  /** How often this client's files carry unstructured addresses (story: Kaze's legacy ERP). */
  addressErrorBias: number;
  address: PostalAddress;
  account: Account;
  agentBic: string;
}

export interface Beneficiary {
  id: string;
  clientId: string;
  name: string;
  country: CountryCode;
  address: PostalAddress;
  account: Account;
  agentBic: string;
  purposeCode: string;
}

const CLIENT_SPECS: Omit<Client, "id" | "address" | "account" | "agentBic">[] = [
  { name: "Kaze Trading Corporation", shortCode: "KAZE", country: "JP", town: "Osaka", channel: "host-to-host", corridors: ["USD-INR", "JPY-USD"], volume: 14, addressErrorBias: 6 },
  { name: "Hikari Motor Parts Co., Ltd.", shortCode: "HIKARI", country: "JP", town: "Hamamatsu", channel: "host-to-host", corridors: ["USD-INR", "JPY-USD"], volume: 12, addressErrorBias: 1 },
  { name: "Tsubame Electronics K.K.", shortCode: "TSUBAME", country: "JP", town: "Tokyo", channel: "e-banking", corridors: ["JPY-USD"], volume: 8, addressErrorBias: 1 },
  { name: "Seto Ceramics K.K.", shortCode: "SETO", country: "JP", town: "Nagoya", channel: "e-banking", corridors: ["JPY-USD"], volume: 5, addressErrorBias: 1 },
  { name: "Northwind Industrial Supply Inc.", shortCode: "NWIND", country: "US", town: "Chicago", channel: "api", corridors: ["USD-AED", "USD-JPY", "USD-INR"], volume: 12, addressErrorBias: 2.5 },
  { name: "Bluegate Logistics LLC", shortCode: "BLUEGATE", country: "US", town: "Houston", channel: "api", corridors: ["USD-AED"], volume: 8, addressErrorBias: 1 },
  { name: "Riverbend Pharma Inc.", shortCode: "RIVERBEND", country: "US", town: "New York", channel: "host-to-host", corridors: ["USD-INR", "USD-JPY"], volume: 9, addressErrorBias: 1 },
  { name: "Cobalt Ridge Foods Inc.", shortCode: "COBALT", country: "US", town: "Atlanta", channel: "e-banking", corridors: ["USD-JPY"], volume: 5, addressErrorBias: 1 },
  { name: "Rheinfeld Maschinenbau GmbH", shortCode: "RHEINF", country: "DE", town: "Stuttgart", channel: "host-to-host", corridors: ["EUR-SGD"], volume: 8, addressErrorBias: 0.6 },
  { name: "Isarwerk Optik GmbH", shortCode: "ISARW", country: "DE", town: "Muenchen", channel: "e-banking", corridors: ["EUR-SGD"], volume: 5, addressErrorBias: 0.6 },
  { name: "Thames Valley Instruments Ltd", shortCode: "TVI", country: "GB", town: "Reading", channel: "api", corridors: ["GBP-USD"], volume: 8, addressErrorBias: 0.8 },
  { name: "Pennine Textiles Ltd", shortCode: "PENNINE", country: "GB", town: "Manchester", channel: "e-banking", corridors: ["GBP-USD"], volume: 6, addressErrorBias: 0.8 },
];

const SUPPLIER_WORDS: Record<CountryCode, { first: string[]; second: string[]; suffix: string[] }> = {
  IN: { first: ["Sahyadri", "Deccan", "Indus", "Narmada", "Konark", "Shivneri", "Coromandel", "Malabar", "Vindhya", "Godavari"], second: ["Auto Components", "Precision Castings", "Engineering Works", "Pharma Ingredients", "Polymers", "Forgings", "Electricals", "Textiles"], suffix: ["Pvt Ltd", "Ltd", "LLP"] },
  JP: { first: ["Asahi", "Kawana", "Midori", "Shirakawa", "Tokai", "Yamabuki", "Kurosawa", "Hoshino"], second: ["Seiki", "Denshi", "Kogyo", "Shoji", "Kasei", "Precision"], suffix: ["Co., Ltd.", "K.K."] },
  US: { first: ["Great Lakes", "Bayou", "Granite", "Prairie", "Redwood", "Harbor", "Summit", "Liberty"], second: ["Packaging", "Fasteners", "Analytics", "Freight", "Components", "Chemicals", "Software"], suffix: ["Inc.", "LLC", "Corp."] },
  AE: { first: ["Al Waha", "Desert Rose", "Gulf Crest", "Al Majd", "Palm Coast", "Creek View"], second: ["Building Materials", "General Trading", "Logistics", "Industrial Supplies", "Equipment Rental"], suffix: ["LLC", "FZE", "FZCO"] },
  SG: { first: ["Lion City", "Marina", "Orchid", "Sentosa", "Kranji", "Tanjong"], second: ["Electronics", "Marine Supplies", "Precision", "Components", "Distribution"], suffix: ["Pte Ltd"] },
  DE: { first: ["Nordwerk"], second: ["Technik"], suffix: ["GmbH"] },
  GB: { first: ["Albion"], second: ["Supplies"], suffix: ["Ltd"] },
};

const PURPOSES = ["SUPP", "SUPP", "SUPP", "GDDS", "SCVE", "TRAD"];

function makeAccount(rng: Rng, country: CountryCode, bic: string): Account {
  switch (country) {
    case "AE":
      return { iban: composeIBAN({ countryCode: "AE", bban: rng.digits(3) + rng.digits(16) })! };
    case "DE":
      return { iban: composeIBAN({ countryCode: "DE", bban: rng.digits(8) + rng.digits(10) })! };
    case "GB":
      return { iban: composeIBAN({ countryCode: "GB", bban: bic.slice(0, 4) + rng.digits(6) + rng.digits(8) })! };
    case "IN":
      return { other: rng.digits(rng.int(12, 16)) };
    case "JP":
      return { other: rng.digits(7) };
    case "SG":
      return { other: rng.digits(10) };
    default:
      return { other: rng.digits(rng.int(9, 12)) };
  }
}

export function makeClients(rng: Rng): Client[] {
  return CLIENT_SPECS.map((spec, i) => {
    const agentBic = ORIGINATING_BIC[spec.country];
    return {
      ...spec,
      id: `CLT-${String(i + 1).padStart(3, "0")}`,
      address: makeAddress(rng, spec.country, spec.town),
      account: makeAccount(rng, spec.country, agentBic),
      agentBic,
    };
  });
}

export function makeBeneficiaries(rng: Rng, clients: Client[]): Beneficiary[] {
  const out: Beneficiary[] = [];
  const usedNames = new Set<string>();
  for (const client of clients) {
    for (const corridorId of client.corridors) {
      const country = CORRIDOR_BY_ID[corridorId].creditorCountry;
      const count = rng.int(3, 5);
      for (let k = 0; k < count; k++) {
        const words = SUPPLIER_WORDS[country];
        let name = "";
        do {
          name = `${rng.pick(words.first)} ${rng.pick(words.second)} ${rng.pick(words.suffix)}`;
        } while (usedNames.has(name));
        usedNames.add(name);
        const bank = rng.pick(beneficiaryBanks(country));
        out.push({
          id: `BEN-${String(out.length + 1).padStart(3, "0")}`,
          clientId: client.id,
          name,
          country,
          address: makeAddress(rng, country),
          account: makeAccount(rng, country, bank.bic),
          agentBic: bank.bic,
          purposeCode: rng.pick(PURPOSES),
        });
      }
    }
  }
  return out;
}
