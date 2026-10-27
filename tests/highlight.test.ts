import { describe, expect, it } from "vitest";
import { buildPacs008, buildPain001 } from "@/lib/iso/build";
import { linesForPath } from "@/lib/iso/highlight";
import type { CreditTransfer } from "@/lib/iso/types";

const t: CreditTransfer = {
  msgId: "M", creDtTm: "2026-11-02T06:00:00", instrId: "I", endToEndId: "E", uetr: "u", amount: "1.00", currency: "USD",
  valueDate: "2026-11-02", chargeBearer: "SHAR",
  debtor: { name: "D", address: { TwnNm: "Osaka", Ctry: "JP" }, account: { other: "1" } }, debtorAgent: { bic: "SYNOJPT0" },
  creditor: { name: "C", address: { StrtNm: "MG Road", TwnNm: "Pune" }, account: { other: "2" } }, creditorAgent: { bic: "DECCINP0" },
  purposeCode: "SUPP",
};
const xml = buildPacs008(t, "SYNOJPT0", "DECCINP0");
const line = (n: number) => xml.split("\n")[n - 1].trim();

describe("linesForPath", () => {
  it("highlights a single element", () => {
    expect(linesForPath(xml, "Cdtr/Nm").map(line)).toEqual(["<Nm>C</Nm>"]);
  });
  it("highlights a whole block, including its open and close tags", () => {
    const got = linesForPath(xml, "Cdtr/PstlAdr").map(line);
    expect(got[0]).toBe("<PstlAdr>");
    expect(got.at(-1)).toBe("</PstlAdr>");
    expect(got).toContain("<TwnNm>Pune</TwnNm>");
    expect(got).not.toContain("<TwnNm>Osaka</TwnNm>");
  });
  it("falls back to the parent when the element is missing", () => {
    const got = linesForPath(xml, "Cdtr/PstlAdr/Ctry").map(line);
    expect(got[0]).toBe("<PstlAdr>");
  });
  it("ignores attribute segments and finds pain.001 amounts", () => {
    const pain = buildPain001(t);
    expect(linesForPath(pain, "Amt/InstdAmt/@Ccy").map((n) => pain.split("\n")[n - 1].trim())[0]).toMatch(/^<InstdAmt Ccy="USD">/);
  });
});
