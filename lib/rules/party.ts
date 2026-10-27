// Bucket 2: missing party name or address.
import { PARTY, party, type PartyRole } from "./helpers";
import type { Finding, Rule } from "./types";

const ROLES: PartyRole[] = ["debtor", "creditor"];

export const partyNameMissing: Rule = {
  id: "PARTY-NAME-MISSING",
  bucket: 2,
  title: "Party name missing",
  checks: "Debtor or creditor name (Nm) is missing or empty.",
  source: "CBPR+ usage guidelines: debtor and creditor name are mandatory",
  run: ({ msg }) => {
    const out: Finding[] = [];
    for (const role of ROLES) {
      if (party(msg, role).name?.trim()) continue;
      out.push({
        ruleId: "PARTY-NAME-MISSING", bucket: 2, severity: "error",
        fieldPath: `${PARTY[role].tag}/Nm`, reasonCode: PARTY[role].addressCode,
        message: `${PARTY[role].label} name is empty. The name is mandatory and is also needed for sanctions screening.`,
      });
    }
    return out;
  },
};

export const partyAddressMissing: Rule = {
  id: "PARTY-ADDRESS-MISSING",
  bucket: 2,
  title: "Party address missing",
  checks: "Debtor or creditor has no postal address at all.",
  source: "CBPR+ / FATF Recommendation 16: originator and beneficiary information must travel with the payment",
  run: ({ msg }) => {
    const out: Finding[] = [];
    for (const role of ROLES) {
      if (party(msg, role).address) continue;
      out.push({
        ruleId: "PARTY-ADDRESS-MISSING", bucket: 2, severity: "error",
        fieldPath: `${PARTY[role].tag}`, reasonCode: PARTY[role].addressCode,
        message: `${PARTY[role].label} has no postal address. At minimum, town and country are needed for a cross-border payment.`,
      });
    }
    return out;
  },
};

export const PARTY_RULES = [partyNameMissing, partyAddressMissing];
