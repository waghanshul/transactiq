import { describe, expect, it } from "vitest";
import { buildPacs002, buildPacs008, buildPain001, esc } from "@/lib/iso/build";
import { isAllowedText, transliterate } from "@/lib/iso/charset";
import { parseMessage, type ParsedReject, type ParsedTransfer } from "@/lib/iso/parse";
import type { CreditTransfer } from "@/lib/iso/types";

const transfer: CreditTransfer = {
  msgId: "MSG-1", creDtTm: "2026-11-02T06:00:00", instrId: "PI-1", endToEndId: "E2E-1",
  uetr: "eaea224a-561c-498f-a7c6-1f8e85beca03", amount: "1250.00", currency: "USD",
  valueDate: "2026-11-02", chargeBearer: "SHAR",
  debtor: { name: "A & B Trading", address: { TwnNm: "Tokyo", Ctry: "JP" }, account: { other: "1234567" } },
  debtorAgent: { bic: "SYNOJPT0" },
  creditor: {
    name: "Deccan Forgings Pvt Ltd",
    address: { StrtNm: "MG Road", BldgNb: "12", PstCd: "411001", TwnNm: "Pune", Ctry: "IN", AdrLine: ["Floor 3, Phoenix House"] },
    account: { iban: "AE070331234567890123456" },
  },
  creditorAgent: { bic: "DECCINP0" },
  purposeCode: "SUPP",
  remittanceInfo: "INV-1",
};

describe("ISO 20022 build and parse", () => {
  it("round-trips a pacs.008", () => {
    const parsed = parseMessage(buildPacs008(transfer, "SYNOJPT0", "DECCINP0")) as ParsedTransfer;
    expect(parsed.msgType).toBe("pacs.008");
    expect(parsed.amount).toBe("1250.00");
    expect(parsed.currency).toBe("USD");
    expect(parsed.debtor.name).toBe("A & B Trading");
    expect(parsed.creditor.address).toEqual(transfer.creditor.address);
    expect(parsed.creditor.iban).toBe("AE070331234567890123456");
    expect(parsed.debtor.account).toBe("1234567");
    expect(parsed.purposeCode).toBe("SUPP");
  });

  it("round-trips a pain.001", () => {
    const parsed = parseMessage(buildPain001(transfer)) as ParsedTransfer;
    expect(parsed.msgType).toBe("pain.001");
    expect(parsed.valueDate).toBe("2026-11-02");
    expect(parsed.creditorAgentBic).toBe("DECCINP0");
  });

  it("keeps postcodes with leading zeros as strings", () => {
    const t = { ...transfer, creditor: { ...transfer.creditor, address: { PstCd: "011001", TwnNm: "X", Ctry: "IN" } } };
    const parsed = parseMessage(buildPacs008(t, "A", "B")) as ParsedTransfer;
    expect(parsed.creditor.address?.PstCd).toBe("011001");
  });

  it("parses a pacs.002 reject", () => {
    const xml = buildPacs002({
      msgId: "RJ1", creDtTm: "2026-11-02T06:00:00", originalMsgId: "MSG-1", originalEndToEndId: "E2E-1",
      originalUetr: transfer.uetr, reasonCode: "RR03", additionalInfo: "Missing creditor address", rejectingBic: "DECCINP0",
    });
    const parsed = parseMessage(xml) as ParsedReject;
    expect(parsed).toMatchObject({ msgType: "pacs.002", status: "RJCT", reasonCode: "RR03", originalEndToEndId: "E2E-1" });
  });

  it("escapes XML special characters", () => {
    expect(esc(`A & <B> "C" 'D'`)).toBe("A &amp; &lt;B&gt; &quot;C&quot; &apos;D&apos;");
  });
});

describe("CBPR+ character set", () => {
  it("accepts plain Latin text and rejects accents and non-Latin script", () => {
    expect(isAllowedText("Deccan Forgings Pvt Ltd, Unit 4/5")).toBe(true);
    expect(isAllowedText("Müller")).toBe(false);
    expect(isAllowedText("朝日精機")).toBe(false);
  });

  it("transliterates common characters", () => {
    expect(transliterate("Müller’s Straße – Süd")).toBe("Mueller's Strasse - Sued");
  });
});
