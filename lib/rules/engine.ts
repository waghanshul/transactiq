// Runs every rule over a batch and decides each payment's outcome.
// Pure and deterministic: the same batch and reference data always give the
// same findings. The answer key is never read here.
import type { Bucket } from "@/lib/reference/buckets";
import { ACCOUNT_RULES } from "./account";
import { ADDRESS_RULES } from "./address";
import { AMOUNT_RULES } from "./amount";
import { BIC_RULES } from "./bic";
import { duplicate } from "./duplicate";
import { FORMAT_RULES } from "./format";
import { PARTY_RULES } from "./party";
import { PURPOSE_RULES } from "./purpose";
import { screening } from "./screening";
import type { CheckablePayment, Finding, ReferenceData, Rule } from "./types";

/** Every rule, in catalogue order. Screening runs first and short-circuits the rest. */
export const RULES: Rule[] = [
  screening,
  ...ADDRESS_RULES,
  ...PARTY_RULES,
  ...ACCOUNT_RULES,
  ...BIC_RULES,
  ...PURPOSE_RULES,
  ...FORMAT_RULES,
  duplicate,
  ...AMOUNT_RULES,
];

export type Outcome = "ready" | "flagged" | "held" | "compliance";

export interface CheckResult {
  findings: Finding[];
  outcome: Outcome;
}

export function checkPayment(payment: CheckablePayment, batch: CheckablePayment[], ref: ReferenceData): CheckResult {
  const corridor = ref.corridors[payment.corridor];
  if (!corridor) throw new Error(`Unknown corridor ${payment.corridor} on ${payment.id}`);
  const ctx = { payment, msg: payment.msg, corridor, ref, batch };

  // A possible sanctions match stops everything else: the payment goes to
  // compliance exactly as received, with no suggestions.
  const hits = screening.run(ctx);
  if (hits.length) return { findings: hits, outcome: "compliance" };

  const findings = RULES.filter((r) => r !== screening).flatMap((r) => r.run(ctx));
  const outcome: Outcome = findings.some((f) => f.severity === "hold")
    ? "held"
    : findings.length
      ? "flagged"
      : "ready";
  return { findings, outcome };
}

export function checkBatch(batch: CheckablePayment[], ref: ReferenceData): Map<string, CheckResult> {
  return new Map(batch.map((p) => [p.id, checkPayment(p, batch, ref)]));
}

// ---------- Repair mode: explaining a pacs.002 rejection ----------

/** Plain-English meaning of each reject reason, and the bucket it usually points to. */
export const REJECT_EXPLANATION: Record<string, { bucket: Bucket; text: string }> = {
  RR02: { bucket: 1, text: "The receiving bank says the debtor's name or address is missing or not structured enough." },
  RR03: { bucket: 1, text: "The receiving bank says the creditor's name or address is missing or not structured enough." },
  BE04: { bucket: 2, text: "The receiving bank says the creditor's address is missing or wrong." },
  AC01: { bucket: 3, text: "The receiving bank says the account number is wrong or missing." },
  AC03: { bucket: 3, text: "The receiving bank says the creditor's account number is wrong or missing." },
  AC04: { bucket: 3, text: "The receiving bank says the creditor's account is closed. Nothing in the message could show this before sending." },
  AC06: { bucket: 3, text: "The receiving bank says the account is blocked." },
  RC01: { bucket: 4, text: "The receiving bank says a bank identifier (BIC) is wrong." },
  RR04: { bucket: 5, text: "The receiving bank rejected it for a regulatory reason, usually a missing or invalid purpose code." },
  FF01: { bucket: 6, text: "The receiving bank says the message format is invalid." },
  AM02: { bucket: 8, text: "The receiving bank says the amount is above what it allows." },
  AM03: { bucket: 8, text: "The receiving bank says it can't process this currency." },
  AM05: { bucket: 7, text: "The receiving bank says this is a duplicate payment." },
};

/**
 * Which failure bucket a rejected payment belongs to. A rule finding on the
 * original message is more specific than the reason code, so it wins when it
 * agrees with the code family; otherwise the code's default bucket is used.
 */
export function rejectBucket(reasonCode: string | null, findings: Finding[]): Bucket | null {
  const byCode = findings.filter((f) => f.reasonCode === reasonCode);
  if (byCode.length) return byCode[0].bucket;
  if (reasonCode && REJECT_EXPLANATION[reasonCode]) return REJECT_EXPLANATION[reasonCode].bucket;
  return findings[0]?.bucket ?? null;
}
