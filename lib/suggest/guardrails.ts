// Guardrails (S3-08). Enforced in the suggestion engine AND again in every
// server action that changes a payment, so the UI can't route around them.

import type { RepairField } from "./types";

/** Fields a repair may change. Anything else is refused. */
export const EDITABLE_FIELDS: ReadonlySet<RepairField> = new Set<RepairField>([
  "Dbtr/Nm", "Cdtr/Nm", "Dbtr/PstlAdr", "Cdtr/PstlAdr",
  "CdtrAgt/FinInstnId/BICFI", "DbtrAgt/FinInstnId/BICFI",
  "Purp/Cd", "PmtId/EndToEndId", "ValueDate",
]);

/** Account numbers, amounts and currencies: never suggested, never edited. */
const PROTECTED = /(Acct|IBAN|Othr\/Id|Amt|IntrBkSttlmAmt|InstdAmt|Ccy|Amount)/;

export function isEditableField(path: string): path is RepairField {
  return EDITABLE_FIELDS.has(path as RepairField) && !PROTECTED.test(path);
}

/** Payments with these statuses are never suggested on or modified. */
const UNTOUCHABLE = new Set(["compliance"]);

export function canSuggest(status: string, findings: { ruleId: string }[]): boolean {
  if (UNTOUCHABLE.has(status)) return false;
  return !findings.some((f) => f.ruleId === "SCREEN-NAME-MATCH");
}

export class GuardrailError extends Error {}

export function assertCanChange(status: string, path: string, findings: { ruleId: string }[] = []) {
  if (!canSuggest(status, findings)) throw new GuardrailError("Payments sent to compliance can't be changed here.");
  if (!isEditableField(path)) throw new GuardrailError(`"${path}" can't be changed: accounts, amounts and currencies are never edited by a repair.`);
}
