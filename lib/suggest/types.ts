// The suggestion contract (S3-01). Every suggestion, whatever produced it,
// has the same shape so the repair panel, the guardrails and the metrics can
// treat them alike.
import type { PostalAddress } from "@/lib/iso/types";

/**
 * Fields a repair may change. Accounts, amounts and currencies are deliberately
 * absent: they are never suggested and never edited (see guardrails.ts).
 */
export type RepairField =
  | "Dbtr/Nm" | "Cdtr/Nm"
  | "Dbtr/PstlAdr" | "Cdtr/PstlAdr"
  | "CdtrAgt/FinInstnId/BICFI" | "DbtrAgt/FinInstnId/BICFI"
  | "Purp/Cd"
  | "PmtId/EndToEndId"
  | "ValueDate";

export type RepairValue = string | PostalAddress;

/** Where a suggested value came from, shown to the analyst. */
export type SuggestionSource =
  | "rule"        // deterministic transformation of what is already in the message
  | "master"      // the client's or beneficiary's record held by the bank
  | "history"     // the client's earlier payments
  | "directory"   // the BIC directory
  | "gazetteer"   // the town and postcode reference lists
  | "llm";        // Gemini fallback, only when the rules are unsure

export interface Suggestion {
  fieldPath: RepairField;
  /** Current value in the message (undefined when the field is missing). */
  oldValue?: RepairValue;
  newValue: RepairValue;
  source: SuggestionSource;
  /** 0 to 1. Below the configured threshold the panel shows options, never a guess. */
  confidence: number;
  /** One plain sentence: why this value. */
  reason: string;
  /** Rule ids this suggestion resolves. */
  resolves: string[];
  /** Other plausible values when confidence is low. */
  options?: RepairValue[];
  /** Notes from cross-checks (OpenStreetMap, history), shown under the reason. */
  checks?: string[];
}

/** Findings that can never get a suggested value: the analyst must ask or route. */
export const NO_SUGGESTION_RULES = new Set([
  "ACCT-IBAN-CHECKSUM", "ACCT-FORMAT",      // never guess an account
  "FMT-AMOUNT", "AMT-CURRENCY", "AMT-LIMIT", // never change amounts or currencies
  "DUP-POSSIBLE",                            // a hold, decided with the client
  "SCREEN-NAME-MATCH",                       // compliance only
]);
