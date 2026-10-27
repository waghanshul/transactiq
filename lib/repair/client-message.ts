// "Never guess" client message (S3-15). For account and amount problems the
// tool never proposes a value: it drafts a note asking the client for the
// correct details. The draft names the problem and the payment, nothing more.

export interface ClientMessageInput {
  clientName: string;
  paymentId: string;
  endToEndId?: string;
  amount: string;
  currency: string;
  creditorName?: string;
  /** Rule ids or pacs.002 reason codes that need the client. */
  problems: string[];
  account?: string;
}

const ASK: Record<string, string> = {
  "ACCT-IBAN-CHECKSUM": "the beneficiary's IBAN fails its check digits, so at least one character is wrong",
  "ACCT-FORMAT": "the beneficiary's account number is not in the format the receiving country uses",
  "FMT-AMOUNT": "the amount has decimals, but the currency has none, so we can't tell what amount you intended",
  AC01: "the receiving bank says the account number is wrong",
  AC03: "the receiving bank says the beneficiary's account number is wrong",
  AC04: "the receiving bank says the beneficiary's account is closed",
  AC06: "the receiving bank says the beneficiary's account is blocked",
};

export const NEEDS_CLIENT = new Set(Object.keys(ASK));

export function draftClientMessage(m: ClientMessageInput): { subject: string; body: string } {
  const reasons = m.problems.map((p) => ASK[p]).filter(Boolean);
  const amountProblem = m.problems.includes("FMT-AMOUNT");
  const ask = amountProblem
    ? "Please confirm the exact amount to send."
    : `Please send us the correct account details for ${m.creditorName ?? "the beneficiary"}, ideally on your letterhead or through your usual secure channel.`;
  const ref = m.endToEndId ? `your reference ${m.endToEndId}` : `our reference ${m.paymentId}`;
  return {
    subject: `Action needed: payment ${m.endToEndId ?? m.paymentId} to ${m.creditorName ?? "beneficiary"} is on hold`,
    body: [
      `Dear ${m.clientName} team,`,
      "",
      `We have not sent the payment of ${m.amount} ${m.currency} to ${m.creditorName ?? "the beneficiary"} (${ref}) because ${reasons.join(", and ")}.`,
      "",
      ask,
      "We have not changed anything in the payment, and we won't guess the correct value. It stays on hold until we hear from you.",
      "",
      "Kind regards,",
      "Payments Operations",
    ].join("\n"),
  };
}
