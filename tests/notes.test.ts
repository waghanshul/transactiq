import { describe, expect, it } from "vitest";
import { anonymise, restoreNames, templateNote, type NoteFacts } from "@/lib/notes/client-note";

const facts: NoteFacts = {
  clientName: "Kaze Trading Corporation",
  totalPayments: 52,
  affectedPayments: 14,
  beneficiaries: [
    { name: "Indus Polymers Pvt Ltd", payments: 5, buckets: [1] },
    { name: "Konark Engineering Works Pvt Ltd", payments: 3, buckets: [1, 5] },
  ],
};

describe("client feedback note", () => {
  it("sends Gemini no client or beneficiary names", () => {
    const json = JSON.stringify(anonymise(facts));
    for (const n of [facts.clientName, ...facts.beneficiaries.map((b) => b.name)]) expect(json).not.toContain(n);
    expect(json).toContain("B1");
  });

  it("puts the names back after drafting", () => {
    const out = restoreNames("Dear [CLIENT],\n- B1: fix the address\n- B2: add a purpose code", facts);
    expect(out).toContain("Kaze Trading Corporation");
    expect(out).toContain("Indus Polymers Pvt Ltd: fix");
    expect(out).toContain("Konark Engineering Works Pvt Ltd: add");
  });

  it("the template names each beneficiary and what to fix, and never an account number", () => {
    const t = templateNote(facts);
    expect(t).toContain("Indus Polymers Pvt Ltd (5 payments)");
    expect(t).toContain("purpose code");
    expect(t).not.toMatch(/\d{8,}/);
  });
});
