// One passing and one failing fixture per rule, built by mutating a clean message.
import { describe, expect, it } from "vitest";
import type { ParsedTransfer } from "@/lib/iso/parse";
import { checkPayment, rejectBucket, RULES } from "@/lib/rules/engine";
import { staticReference } from "@/lib/rules/reference";
import { jaroWinkler, normaliseName } from "@/lib/rules/screening";
import type { CheckablePayment } from "@/lib/rules/types";

const ref = staticReference();
const T0 = new Date("2026-11-02T06:00:00Z");

function clean(): ParsedTransfer {
  return {
    msgType: "pacs.008",
    msgId: "M1",
    endToEndId: "KAZE-INV-100001",
    uetr: "eaea224a-561c-498f-a7c6-1f8e85beca03",
    amount: "12500.00",
    currency: "USD",
    valueDate: "2026-11-02",
    debtor: { name: "Kaze Trading Corporation", address: { StrtNm: "Umeda", BldgNb: "1-2-3", PstCd: "530-0001", TwnNm: "Osaka", Ctry: "JP" }, account: "1234567" },
    creditor: { name: "Deccan Forgings Pvt Ltd", address: { StrtNm: "MG Road", BldgNb: "12", PstCd: "411001", TwnNm: "Pune", Ctry: "IN" }, account: "123456789012" },
    debtorAgentBic: "SYNOJPT0",
    creditorAgentBic: "DECCINP0",
    purposeCode: "SUPP",
    remittanceInfo: "INV-100001 KAZE PO 11111",
  };
}

function payment(msg: ParsedTransfer, over: Partial<CheckablePayment> = {}): CheckablePayment {
  return { id: "P1", msgType: "pacs.008", clientId: "CLT-001", corridor: "USD-INR", receivedAt: T0, msg, ...over };
}

function ruleIds(msg: ParsedTransfer, over: Partial<CheckablePayment> = {}, batch?: CheckablePayment[]): string[] {
  const p = payment(msg, over);
  return checkPayment(p, batch ?? [p], ref).findings.map((f) => f.ruleId);
}

type Mutation = [ruleId: string, label: string, mutate: (m: ParsedTransfer) => void, over?: Partial<CheckablePayment>];

const CASES: Mutation[] = [
  ["ADDR-UNSTRUCTURED", "creditor address is free text", (m) => { m.creditor.address = { AdrLine: ["12 MG Road", "Pune 411001, India"] }; }],
  ["ADDR-UNSTRUCTURED", "debtor free text with town but no country", (m) => { m.debtor.address = { TwnNm: "Osaka", AdrLine: ["1-2-3 Umeda"] }; }],
  ["ADDR-TOWN-COUNTRY-MISSING", "no country", (m) => { delete m.creditor.address!.Ctry; }],
  ["ADDR-TOWN-COUNTRY-MISSING", "no town", (m) => { delete m.creditor.address!.TwnNm; }],
  ["ADDR-COUNTRY-CODE", "country name instead of code", (m) => { m.creditor.address!.Ctry = "India"; }],
  ["ADDR-HYBRID-DUPLICATE", "town repeated in AdrLine", (m) => { m.creditor.address = { TwnNm: "Pune", Ctry: "IN", AdrLine: ["12 MG Road, Pune"] }; }],
  ["ADDR-LINE-LIMITS", "line over 70 characters", (m) => { m.creditor.address = { TwnNm: "Pune", Ctry: "IN", AdrLine: ["x".repeat(71)] }; }],
  ["ADDR-LINE-LIMITS", "three hybrid lines", (m) => { m.creditor.address = { TwnNm: "Pune", Ctry: "IN", AdrLine: ["a", "b", "c"] }; }],
  ["PARTY-NAME-MISSING", "empty debtor name", (m) => { m.debtor.name = ""; }],
  ["PARTY-ADDRESS-MISSING", "no creditor address", (m) => { delete m.creditor.address; }],
  ["ACCT-IBAN-CHECKSUM", "IBAN with a changed digit", (m) => { m.creditor.account = undefined; m.creditor.iban = "AE070331234567890123457"; }],
  ["ACCT-FORMAT", "letters in a numeric account", (m) => { m.creditor.account = "1234O6789O12"; }],
  ["ACCT-FORMAT", "no account at all", (m) => { m.creditor.account = undefined; }],
  ["BIC-FORMAT", "7-character BIC", (m) => { m.creditorAgentBic = "DECCINP"; }],
  ["BIC-NOT-IN-DIRECTORY", "well-formed unknown BIC", (m) => { m.creditorAgentBic = "QXTRINP0"; }],
  ["BIC-COUNTRY-MISMATCH", "Singapore bank for an Indian creditor", (m) => { m.creditorAgentBic = "MRLNSGS0"; }],
  ["PURPOSE-REQUIRED", "no purpose on USD-INR", (m) => { delete m.purposeCode; }],
  ["PURPOSE-INVALID", "made-up purpose code", (m) => { m.purposeCode = "SUPPLIER"; }],
  ["FMT-CHARSET", "curly apostrophe and en dash", (m) => { m.creditor.name = "Deccan’s Forgings – Accounts"; }],
  ["FMT-CHARSET", "Japanese script", (m) => { m.creditor.name = "朝日精機株式会社"; }],
  ["FMT-E2E-LENGTH", "36-character reference", (m) => { m.endToEndId = "x".repeat(36); }],
  ["FMT-DATE", "DD/MM/YYYY date", (m) => { m.valueDate = "02/11/2026"; }],
  ["FMT-AMOUNT", "decimals on JPY", (m) => { m.currency = "JPY"; m.amount = "1500000.50"; }, { corridor: "USD-JPY" }],
  ["FMT-AMOUNT", "three decimals on USD", (m) => { m.amount = "100.005"; }],
  ["AMT-CURRENCY", "INR on USD-INR", (m) => { m.currency = "INR"; }],
  ["AMT-LIMIT", "above the corridor maximum", (m) => { m.amount = "3500000.00"; }],
  ["SCREEN-NAME-MATCH", "look-alike of a watchlist name", (m) => { m.creditor.name = "Zorvex Maritim Holding"; }],
];

describe("each rule", () => {
  it("passes the clean message with no findings", () => {
    expect(ruleIds(clean())).toEqual([]);
  });

  for (const [ruleId, label, mutate, over] of CASES) {
    it(`${ruleId}: fires on ${label}`, () => {
      const m = clean();
      mutate(m);
      expect(ruleIds(m, over)).toContain(ruleId);
    });
  }

  it("has a failing fixture for every rule except duplicates (tested below)", () => {
    const covered = new Set(CASES.map((c) => c[0]));
    const missing = RULES.map((r) => r.id).filter((id) => id !== "DUP-POSSIBLE" && !covered.has(id));
    expect(missing).toEqual([]);
  });
});

describe("duplicates", () => {
  const a = payment(clean(), { id: "A", receivedAt: T0 });
  const b = payment(clean(), { id: "B", receivedAt: new Date(T0.getTime() + 6 * 60_000) });

  it("holds the later of two identical payments and not the earlier one", () => {
    const batch = [a, b];
    expect(checkPayment(b, batch, ref)).toMatchObject({ outcome: "held" });
    expect(checkPayment(a, batch, ref)).toMatchObject({ outcome: "ready" });
  });

  it("ignores repeats outside the 30-minute window", () => {
    const late = payment(clean(), { id: "C", receivedAt: new Date(T0.getTime() + 45 * 60_000) });
    expect(checkPayment(late, [a, late], ref).outcome).toBe("ready");
  });

  it("ignores payments that differ in amount", () => {
    const m = clean();
    m.amount = "12500.01";
    const other = payment(m, { id: "D", receivedAt: new Date(T0.getTime() + 5 * 60_000) });
    expect(checkPayment(other, [a, other], ref).outcome).toBe("ready");
  });
});

describe("screening", () => {
  it("routes a match to compliance and suppresses every other finding", () => {
    const m = clean();
    m.creditor.name = "Qelmarah Trading FZE";
    m.creditor.address = { AdrLine: ["free text"] };
    const r = checkPayment(payment(m), [payment(m)], ref);
    expect(r.outcome).toBe("compliance");
    expect(r.findings.map((f) => f.ruleId)).toEqual(["SCREEN-NAME-MATCH"]);
  });

  it("does not flag ordinary supplier names", () => {
    for (const name of ["Deccan Forgings Pvt Ltd", "Granite Packaging LLC", "Marina Electronics Pte Ltd", "Zenith Motors Inc."]) {
      const m = clean();
      m.creditor.name = name;
      expect(ruleIds(m)).not.toContain("SCREEN-NAME-MATCH");
    }
  });

  it("computes Jaro-Winkler on known pairs", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 3);
    expect(jaroWinkler("abc", "abc")).toBe(1);
    expect(jaroWinkler("abc", "xyz")).toBe(0);
    expect(normaliseName("Qelmara Trading FZE")).toBe("qelmara trading");
  });
});

describe("reject explanations", () => {
  it("prefers a matching rule finding over the reason code's default bucket", () => {
    expect(rejectBucket("RR03", [{ ruleId: "PARTY-ADDRESS-MISSING", bucket: 2, severity: "error", fieldPath: "Cdtr", reasonCode: "RR03", message: "m" }])).toBe(2);
  });

  it("falls back to the reason code when nothing in the message shows the problem", () => {
    expect(rejectBucket("AC04", [])).toBe(3);
  });
});

describe("outcomes", () => {
  it("flags a payment with an ordinary error", () => {
    const m = clean();
    delete m.purposeCode;
    expect(checkPayment(payment(m), [payment(m)], ref).outcome).toBe("flagged");
  });
});
