// Bucket 5: regulatory and purpose data.
import { PURPOSE_CODE_SET } from "@/lib/reference/codes";
import type { Rule } from "./types";

export const purposeRequired: Rule = {
  id: "PURPOSE-REQUIRED",
  bucket: 5,
  title: "Purpose code missing",
  checks: "Corridor requires a purpose code and Purp/Cd is empty.",
  source: "Corridor rules (illustrative): e.g. inward remittances to India and UAE need a purpose",
  run: ({ msg, corridor }) => {
    if (!corridor.purposeRequired || msg.purposeCode) return [];
    return [{
      ruleId: "PURPOSE-REQUIRED", bucket: 5, severity: "error",
      fieldPath: "Purp/Cd", reasonCode: "RR04",
      message: `Payments on ${corridor.label} need a purpose code, and this one has none. Use an ISO purpose code such as SUPP (supplier payment).`,
    }];
  },
};

export const purposeValid: Rule = {
  id: "PURPOSE-INVALID",
  bucket: 5,
  title: "Purpose code not recognised",
  checks: "Purp/Cd is not in the ISO ExternalPurpose1Code list.",
  source: "ISO 20022 External Code Sets: ExternalPurpose1Code",
  run: ({ msg }) => {
    if (!msg.purposeCode || PURPOSE_CODE_SET.has(msg.purposeCode)) return [];
    return [{
      ruleId: "PURPOSE-INVALID", bucket: 5, severity: "error",
      fieldPath: "Purp/Cd", reasonCode: "RR04",
      message: `Purpose code "${msg.purposeCode}" isn't an ISO purpose code. Codes are four letters, for example SUPP, GDDS or SCVE.`,
    }];
  },
};

export const PURPOSE_RULES = [purposeRequired, purposeValid];
