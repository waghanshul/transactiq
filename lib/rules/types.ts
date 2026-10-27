// Shared types for the pre-send validation rules (Sprint 2).
// Rules are pure functions: same input, same findings, no I/O, and they never
// read the answer key.
import type { ParsedTransfer } from "@/lib/iso/parse";
import type { Bucket } from "@/lib/reference/buckets";
import type { Corridor } from "@/lib/reference/corridors";

export type Severity = "error" | "hold" | "compliance";

export interface Finding {
  ruleId: string;
  bucket: Bucket;
  severity: Severity;
  /** Element path inside the transaction, e.g. "Cdtr/PstlAdr/Ctry". */
  fieldPath: string;
  /** ISO external status reason code the receiving bank would likely use. */
  reasonCode: string | null;
  /** One plain-English sentence an analyst can act on. */
  message: string;
}

export interface CheckablePayment {
  id: string;
  msgType: "pacs.008" | "pain.001";
  clientId: string;
  corridor: string;
  receivedAt: Date;
  msg: ParsedTransfer;
}

export interface ReferenceData {
  corridors: Record<string, Corridor>;
  /** BIC (8 or 11 characters) -> ISO country code. */
  bicCountry: Map<string, string>;
  watchlist: { name: string; aliases: string[] }[];
}

export interface RuleContext {
  payment: CheckablePayment;
  msg: ParsedTransfer;
  corridor: Corridor;
  ref: ReferenceData;
  /** Every payment in the batch, for cross-payment rules such as duplicates. */
  batch: CheckablePayment[];
}

export interface Rule {
  id: string;
  bucket: Bucket;
  title: string;
  /** What the rule checks, for the rule catalogue. */
  checks: string;
  /** Where the requirement comes from. */
  source: string;
  run: (ctx: RuleContext) => Finding[];
}

/** Element names differ between pain.001 and pacs.008 for amount and date. */
export function amountPath(msgType: CheckablePayment["msgType"]): string {
  return msgType === "pacs.008" ? "IntrBkSttlmAmt" : "Amt/InstdAmt";
}

export function datePath(msgType: CheckablePayment["msgType"]): string {
  return msgType === "pacs.008" ? "IntrBkSttlmDt" : "ReqdExctnDt/Dt";
}
