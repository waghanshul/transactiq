// Bucket 8: amount or currency not allowed on the corridor. Routed to the
// payments desk; never auto-fixed.
import { amountPath, type Rule } from "./types";

export const currencyAllowed: Rule = {
  id: "AMT-CURRENCY",
  bucket: 8,
  title: "Currency not accepted on this corridor",
  checks: "Currency is not in the corridor's allowed list.",
  source: "Corridor rules (illustrative)",
  run: ({ msg, corridor, payment }) => {
    const ccy = msg.currency ?? "";
    if (corridor.allowedCurrencies.includes(ccy)) return [];
    return [{
      ruleId: "AMT-CURRENCY", bucket: 8, severity: "error",
      fieldPath: `${amountPath(payment.msgType)}/@Ccy`, reasonCode: "AM03",
      message: `${ccy || "No currency"} isn't accepted on ${corridor.label}. Allowed: ${corridor.allowedCurrencies.join(", ")}. Route to the payments desk.`,
    }];
  },
};

export const amountLimit: Rule = {
  id: "AMT-LIMIT",
  bucket: 8,
  title: "Amount above the corridor limit",
  checks: "Amount exceeds the corridor's single-payment maximum (same currency only).",
  source: "Corridor rules (illustrative)",
  run: ({ msg, corridor, payment }) => {
    if (msg.currency !== corridor.currency) return [];
    const amt = Number(msg.amount);
    if (!Number.isFinite(amt) || amt <= corridor.maxAmount) return [];
    return [{
      ruleId: "AMT-LIMIT", bucket: 8, severity: "error",
      fieldPath: amountPath(payment.msgType), reasonCode: "AM02",
      message: `Amount is above the ${corridor.label} limit of ${corridor.maxAmount.toLocaleString("en-US")} ${corridor.currency}. Route to the payments desk for approval.`,
    }];
  },
};

export const AMOUNT_RULES = [currencyAllowed, amountLimit];
