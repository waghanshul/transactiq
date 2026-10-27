// Bucket 4: bank identifier (BIC) problems.
import { isValidBIC } from "ibantools";
import { isCountryCode } from "@/lib/reference/countries";
import { PARTY, type PartyRole } from "./helpers";
import type { Finding, Rule, RuleContext } from "./types";

const ROLES: PartyRole[] = ["debtor", "creditor"];

function agentBic(ctx: RuleContext, role: PartyRole): string | undefined {
  return role === "debtor" ? ctx.msg.debtorAgentBic : ctx.msg.creditorAgentBic;
}

function bank(role: PartyRole): string {
  return role === "debtor" ? "Debtor's bank" : "Creditor's bank";
}

export const bicFormat: Rule = {
  id: "BIC-FORMAT",
  bucket: 4,
  title: "BIC has the wrong format",
  checks: "Agent BIC is not 8 or 11 characters in the ISO 9362 pattern.",
  source: "ISO 9362 (BIC)",
  run: (ctx) => {
    const out: Finding[] = [];
    for (const role of ROLES) {
      const bic = agentBic(ctx, role);
      if (bic && isValidBIC(bic)) continue;
      out.push({
        ruleId: "BIC-FORMAT", bucket: 4, severity: "error",
        fieldPath: `${PARTY[role].agent}/FinInstnId/BICFI`, reasonCode: "RC01",
        message: bic
          ? `${bank(role)} BIC "${bic}" has ${bic.length} characters. A BIC has 8 or 11.`
          : `${bank(role)} BIC is missing.`,
      });
    }
    return out;
  },
};

export const bicDirectory: Rule = {
  id: "BIC-NOT-IN-DIRECTORY",
  bucket: 4,
  title: "BIC not in the directory",
  checks: "Well-formed agent BIC that is not in the BIC directory.",
  source: "BIC directory (SwiftRef in production; synthetic directory in this demo)",
  run: (ctx) => {
    const out: Finding[] = [];
    for (const role of ROLES) {
      const bic = agentBic(ctx, role);
      if (!bic || !isValidBIC(bic)) continue;
      if (ctx.ref.bicCountry.has(bic) || ctx.ref.bicCountry.has(bic.slice(0, 8))) continue;
      out.push({
        ruleId: "BIC-NOT-IN-DIRECTORY", bucket: 4, severity: "error",
        fieldPath: `${PARTY[role].agent}/FinInstnId/BICFI`, reasonCode: "RC01",
        message: `${bank(role)} BIC "${bic}" is well formed but isn't in the BIC directory. It may be a typo or a closed branch.`,
      });
    }
    return out;
  },
};

export const bicCountryMismatch: Rule = {
  id: "BIC-COUNTRY-MISMATCH",
  bucket: 4,
  title: "Creditor's bank is in a different country",
  checks: "Country in the creditor agent BIC (characters 5-6) differs from the creditor's address country.",
  source: "ISO 9362: characters 5-6 of a BIC are the ISO country code",
  run: (ctx) => {
    const bic = ctx.msg.creditorAgentBic;
    const ctry = ctx.msg.creditor.address?.Ctry;
    if (!bic || !isValidBIC(bic) || !ctry || !isCountryCode(ctry)) return [];
    const bicCountry = bic.slice(4, 6);
    if (bicCountry === ctry) return [];
    return [{
      ruleId: "BIC-COUNTRY-MISMATCH", bucket: 4, severity: "error",
      fieldPath: "CdtrAgt/FinInstnId/BICFI", reasonCode: "RC01",
      message: `Creditor's bank BIC "${bic}" is in ${bicCountry}, but the creditor's address is in ${ctry}. The bank code is probably wrong.`,
    }];
  },
};

export const BIC_RULES = [bicFormat, bicDirectory, bicCountryMismatch];
