// Bucket 3: account problems. These are never auto-fixed: the tool can only
// say the account looks wrong and ask the client for the right one.
import { isValidIBAN } from "ibantools";
import { PARTY, party, type PartyRole } from "./helpers";
import type { Finding, Rule } from "./types";

const ROLES: PartyRole[] = ["debtor", "creditor"];

function code(role: PartyRole): string {
  return role === "creditor" ? "AC03" : "AC01";
}

export const accountIban: Rule = {
  id: "ACCT-IBAN-CHECKSUM",
  bucket: 3,
  title: "IBAN fails its checksum",
  checks: "IBAN fails the ISO 13616 mod-97 check or the country's length and format.",
  source: "ISO 13616 (IBAN)",
  run: ({ msg }) => {
    const out: Finding[] = [];
    for (const role of ROLES) {
      const iban = party(msg, role).iban;
      if (iban === undefined || isValidIBAN(iban)) continue;
      out.push({
        ruleId: "ACCT-IBAN-CHECKSUM", bucket: 3, severity: "error",
        fieldPath: `${PARTY[role].account}/Id/IBAN`, reasonCode: "AC01",
        message: `${PARTY[role].label} IBAN fails its check digits, so at least one character is wrong. Ask the client for the correct IBAN; never guess an account number.`,
      });
    }
    return out;
  },
};

export const accountFormat: Rule = {
  id: "ACCT-FORMAT",
  bucket: 3,
  title: "Account number malformed or missing",
  checks: "Non-IBAN account is missing or contains characters other than digits.",
  source: "Corridor account formats (IN, JP, US, SG domestic accounts are numeric)",
  run: ({ msg }) => {
    const out: Finding[] = [];
    for (const role of ROLES) {
      const p = party(msg, role);
      if (p.iban !== undefined) continue;
      if (p.account && /^\d+$/.test(p.account)) continue;
      out.push({
        ruleId: "ACCT-FORMAT", bucket: 3, severity: "error",
        fieldPath: `${PARTY[role].account}/Id/Othr/Id`, reasonCode: code(role),
        message: p.account
          ? `${PARTY[role].label} account number "${p.account}" contains letters; accounts on this corridor are numeric. Letters like O and l are often typos for 0 and 1. Ask the client to confirm.`
          : `${PARTY[role].label} has no account number. Ask the client for it.`,
      });
    }
    return out;
  },
};

export const ACCOUNT_RULES = [accountIban, accountFormat];
