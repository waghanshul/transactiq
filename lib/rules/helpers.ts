import type { PostalAddress } from "@/lib/iso/types";
import type { ParsedParty } from "@/lib/iso/parse";

export type PartyRole = "debtor" | "creditor";

export const PARTY: Record<PartyRole, { tag: string; label: string; addressCode: string; account: string; agent: string }> = {
  debtor: { tag: "Dbtr", label: "Debtor", addressCode: "RR02", account: "DbtrAcct", agent: "DbtrAgt" },
  creditor: { tag: "Cdtr", label: "Creditor", addressCode: "RR03", account: "CdtrAcct", agent: "CdtrAgt" },
};

export function party(msg: { debtor: ParsedParty; creditor: ParsedParty }, role: PartyRole): ParsedParty {
  return role === "debtor" ? msg.debtor : msg.creditor;
}

export function hasStructuredParts(a: PostalAddress): boolean {
  return (["StrtNm", "BldgNb", "BldgNm", "Flr", "PstBx", "PstCd", "TwnNm", "DstrctNm", "CtrySubDvsn", "Ctry"] as const)
    .some((k) => a[k] !== undefined && a[k] !== "");
}

/** True when `word` appears in `text` as a whole word, ignoring case. */
export function containsWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i").test(text);
}
