// Bucket 7: possible duplicate. The later payment is held for a person to
// confirm; it is never released or cancelled automatically.
import type { CheckablePayment, Rule } from "./types";

export const DUPLICATE_WINDOW_MIN = 30;

function key(p: CheckablePayment): string {
  const m = p.msg;
  return [p.clientId, m.creditor.name, m.amount, m.currency, m.remittanceInfo].join("|").toLowerCase();
}

export const duplicate: Rule = {
  id: "DUP-POSSIBLE",
  bucket: 7,
  title: "Possible duplicate payment",
  checks: `Same client, creditor, amount, currency and remittance text as a payment received in the previous ${DUPLICATE_WINDOW_MIN} minutes.`,
  source: "Payments operations duplicate controls",
  run: ({ payment, batch }) => {
    const k = key(payment);
    const t = payment.receivedAt.getTime();
    const earlier = batch
      .filter((o) => o.id !== payment.id && key(o) === k)
      .filter((o) => {
        const dt = t - o.receivedAt.getTime();
        return dt > 0 && dt <= DUPLICATE_WINDOW_MIN * 60_000;
      })
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0];
    if (!earlier) return [];
    const mins = Math.round((t - earlier.receivedAt.getTime()) / 60_000);
    return [{
      ruleId: "DUP-POSSIBLE", bucket: 7, severity: "hold",
      fieldPath: "CdtTrfTxInf", reasonCode: "AM05",
      message: `Looks like a repeat of ${earlier.id}, received ${mins} min earlier: same client, creditor, amount and remittance text. Held until someone confirms it's intended.`,
    }];
  },
};
