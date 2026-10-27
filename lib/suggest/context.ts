// Builds each payment's SuggestContext from plain rows, so the database code
// and the tests share one implementation. Uses the bank's own data only:
// client and beneficiary records, the BIC directory and other payments.
// It never reads the answer key.
import type { ParsedTransfer } from "@/lib/iso/parse";
import type { PostalAddress } from "@/lib/iso/types";
import type { SuggestContext } from "./engine";

export interface ContextRows {
  payments: { id: string; clientId: string; beneficiaryId: string | null; corridor: string; receivedAt: Date; msg: ParsedTransfer }[];
  clients: { id: string; name: string; address: PostalAddress; agentBic: string }[];
  beneficiaries: { id: string; name: string; address: PostalAddress; agentBic: string }[];
  bics: { bic: string; country: string; name: string }[];
  corridorCountry: Record<string, string>;
}

export function contextBuilder(rows: ContextRows): (paymentId: string) => SuggestContext | undefined {
  const clients = new Map(rows.clients.map((c) => [c.id, c]));
  const bens = new Map(rows.beneficiaries.map((b) => [b.id, b]));
  const bics = new Map(rows.bics.map((b) => [b.bic, { country: b.country, name: b.name }]));
  const byId = new Map(rows.payments.map((p) => [p.id, p]));
  const byClientCorridor = new Map<string, typeof rows.payments>();
  for (const p of rows.payments) {
    const k = `${p.clientId}|${p.corridor}`;
    byClientCorridor.set(k, [...(byClientCorridor.get(k) ?? []), p]);
  }
  const refsByClient = new Map<string, string[]>();
  for (const p of rows.payments) if (p.msg.endToEndId) refsByClient.set(p.clientId, [...(refsByClient.get(p.clientId) ?? []), p.msg.endToEndId]);
  return (paymentId) => {
    const p = byId.get(paymentId);
    if (!p) return undefined;
    const client = clients.get(p.clientId);
    const ben = p.beneficiaryId ? bens.get(p.beneficiaryId) : undefined;
    const history = (byClientCorridor.get(`${p.clientId}|${p.corridor}`) ?? [])
      .filter((o) => o.id !== p.id && o.msg.purposeCode)
      .map((o) => ({ code: o.msg.purposeCode!, sameCreditor: !!p.beneficiaryId && o.beneficiaryId === p.beneficiaryId }));
    return {
      client: client ? { name: client.name, address: client.address, agentBic: client.agentBic } : undefined,
      beneficiary: ben ? { name: ben.name, address: ben.address, agentBic: ben.agentBic } : undefined,
      bics,
      purposeHistory: history,
      creditorCountry: rows.corridorCountry[p.corridor] ?? "",
      receivedAt: p.receivedAt,
      clientReferences: (refsByClient.get(p.clientId) ?? []).filter((r) => r !== p.msg.endToEndId).slice(0, 50),
    };
  };
}
