// Re-runs the full rule set on a repaired message (S3-11). The repair is
// checked on its own: duplicates are a hold decided with the client, not
// something a field repair can fix, so the batch context is not needed.
import { parseMessage, type ParsedTransfer } from "@/lib/iso/parse";
import { checkPayment } from "@/lib/rules/engine";
import type { Finding, ReferenceData } from "@/lib/rules/types";

export interface RevalidateInput {
  id: string;
  msgType: "pacs.008" | "pain.001";
  clientId: string;
  corridor: string;
  receivedAt: Date;
}

export function revalidate(p: RevalidateInput, xml: string, ref: ReferenceData): { msg: ParsedTransfer; findings: Finding[] } {
  const msg = parseMessage(xml) as ParsedTransfer;
  const payment = { ...p, msg };
  return { msg, findings: checkPayment(payment, [payment], ref).findings };
}
