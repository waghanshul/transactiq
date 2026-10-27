// Bucket 6: format and schema errors.
import { isAllowedText } from "@/lib/iso/charset";
import { ZERO_DECIMAL_CURRENCIES } from "@/lib/reference/corridors";
import { PARTY, party, type PartyRole } from "./helpers";
import { amountPath, datePath, type Finding, type Rule } from "./types";

const ROLES: PartyRole[] = ["debtor", "creditor"];

export const nameCharset: Rule = {
  id: "FMT-CHARSET",
  bucket: 6,
  title: "Characters outside the allowed set",
  checks: "Party names contain characters outside the CBPR+ Latin character set.",
  source: "CBPR+ usage guidelines: extended Latin character set",
  run: ({ msg }) => {
    const out: Finding[] = [];
    for (const role of ROLES) {
      const name = party(msg, role).name;
      if (!name || isAllowedText(name)) continue;
      const bad = Array.from(new Set(Array.from(name).filter((ch) => !isAllowedText(ch)))).slice(0, 4).join(" ");
      out.push({
        ruleId: "FMT-CHARSET", bucket: 6, severity: "error",
        fieldPath: `${PARTY[role].tag}/Nm`, reasonCode: "FF01",
        message: `${PARTY[role].label} name contains characters that aren't allowed: ${bad}. Use the Latin form of the name.`,
      });
    }
    return out;
  },
};

export const endToEndLength: Rule = {
  id: "FMT-E2E-LENGTH",
  bucket: 6,
  title: "Reference too long",
  checks: "EndToEndId longer than 35 characters.",
  source: "ISO 20022 Max35Text",
  run: ({ msg }) => {
    const id = msg.endToEndId ?? "";
    if (id.length <= 35) return [];
    return [{
      ruleId: "FMT-E2E-LENGTH", bucket: 6, severity: "error",
      fieldPath: "PmtId/EndToEndId", reasonCode: "FF01",
      message: `End-to-end reference is ${id.length} characters; the limit is 35.`,
    }];
  },
};

export const dateFormat: Rule = {
  id: "FMT-DATE",
  bucket: 6,
  title: "Date not in ISO format",
  checks: "Settlement or execution date not in YYYY-MM-DD.",
  source: "ISO 20022 ISODate",
  run: ({ msg, payment }) => {
    const d = msg.valueDate ?? "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d))) return [];
    return [{
      ruleId: "FMT-DATE", bucket: 6, severity: "error",
      fieldPath: datePath(payment.msgType), reasonCode: "FF01",
      message: `Date "${d}" isn't in ISO format. It must be YYYY-MM-DD.`,
    }];
  },
};

export const amountFormat: Rule = {
  id: "FMT-AMOUNT",
  bucket: 6,
  title: "Amount has the wrong number of decimals",
  checks: "Amount is not a plain decimal, or has decimals the currency doesn't allow (JPY has none).",
  source: "ISO 4217 minor units; ISO 20022 ActiveCurrencyAndAmount",
  run: ({ msg, payment }) => {
    const amt = msg.amount ?? "";
    const ccy = msg.currency ?? "";
    const decimals = ZERO_DECIMAL_CURRENCIES.has(ccy) ? 0 : 2;
    const ok = decimals === 0 ? /^\d+$/.test(amt) : /^\d+(\.\d{1,2})?$/.test(amt);
    if (ok) return [];
    return [{
      ruleId: "FMT-AMOUNT", bucket: 6, severity: "error",
      fieldPath: amountPath(payment.msgType), reasonCode: "FF01",
      message: decimals === 0
        ? `${ccy} has no minor unit, so "${amt}" can't have decimals. Amounts are never changed automatically: confirm the right amount with the client.`
        : `Amount "${amt}" isn't a valid ${ccy} amount (digits with at most 2 decimals).`,
    }];
  },
};

export const FORMAT_RULES = [nameCharset, endToEndLength, dateFormat, amountFormat];
