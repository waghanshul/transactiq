// The failure taxonomy from the POC deep dive. Every seeded error, validation
// finding and reject maps to exactly one bucket.

export type Bucket = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface BucketInfo {
  id: Bucket;
  label: string;
  short: string;
  /** How far the tool may go for this bucket. */
  action: "suggest" | "auto_format" | "contact_client" | "hold" | "route_desk" | "route_compliance";
  reasonCodes: string[];
}

export const BUCKETS: Record<Bucket, BucketInfo> = {
  1: { id: 1, label: "Unstructured or malformed address", short: "Address", action: "suggest", reasonCodes: ["RR02", "RR03"] },
  2: { id: 2, label: "Missing party name or address", short: "Party data", action: "suggest", reasonCodes: ["RR02", "RR03", "BE04"] },
  3: { id: 3, label: "Account problem", short: "Account", action: "contact_client", reasonCodes: ["AC01", "AC03", "AC04", "AC06"] },
  4: { id: 4, label: "Bank identifier problem", short: "BIC", action: "suggest", reasonCodes: ["RC01"] },
  5: { id: 5, label: "Regulatory or purpose data missing", short: "Purpose", action: "suggest", reasonCodes: ["RR04"] },
  6: { id: 6, label: "Format or schema error", short: "Format", action: "auto_format", reasonCodes: ["FF01"] },
  7: { id: 7, label: "Possible duplicate", short: "Duplicate", action: "hold", reasonCodes: ["AM05"] },
  8: { id: 8, label: "Amount or currency not allowed", short: "Amount/ccy", action: "route_desk", reasonCodes: ["AM02", "AM03"] },
  9: { id: 9, label: "Possible sanctions match", short: "Screening", action: "route_compliance", reasonCodes: [] },
};

export const ACTION_LABEL: Record<BucketInfo["action"], string> = {
  suggest: "Suggest a fix, human approves",
  auto_format: "Safe formatting fix, logged",
  contact_client: "Never guess: ask the client",
  hold: "Hold and confirm",
  route_desk: "Route to payments desk",
  route_compliance: "Route to compliance, unchanged",
};
