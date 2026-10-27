import { createHash } from "node:crypto";
import { isValidIBAN } from "ibantools";
import { describe, expect, it } from "vitest";
import { isAllowedText } from "@/lib/iso/charset";
import { parseMessage, type ParsedReject, type ParsedTransfer } from "@/lib/iso/parse";
import { BANKS } from "@/lib/reference/banks";
import { PURPOSE_CODE_SET, REASON_CODE_SET } from "@/lib/reference/codes";
import { CORRIDOR_BY_ID, ZERO_DECIMAL_CURRENCIES } from "@/lib/reference/corridors";
import { isCountryCode } from "@/lib/reference/countries";
import { generateDataset } from "@/lib/synth/generate";

const BASE = new Date("2026-11-02T06:00:00Z");
const ds = generateDataset({ baseDate: BASE });
const answered = new Set(ds.answerKey.map((a) => a.paymentId));
const directory = new Set(BANKS.map((b) => b.bic));

function hash(): string {
  const again = generateDataset({ baseDate: BASE });
  return createHash("sha256").update(again.payments.map((p) => p.xml + (p.rejectXml ?? "")).join("")).digest("hex");
}

/** Problems found in a message that is supposed to be clean. Mirrors the Sprint 2 rules. */
function problems(p: (typeof ds.payments)[number]): string[] {
  const out: string[] = [];
  const m = parseMessage(p.xml) as ParsedTransfer;
  const corridor = CORRIDOR_BY_ID[p.corridor];
  for (const [role, party] of [["debtor", m.debtor], ["creditor", m.creditor]] as const) {
    const a = party.address;
    if (!party.name) out.push(`${role} name missing`);
    else if (!isAllowedText(party.name)) out.push(`${role} name charset`);
    if (!a?.TwnNm || !a?.Ctry) out.push(`${role} address not structured`);
    if (a?.AdrLine?.length) out.push(`${role} has AdrLine`);
    if (a?.Ctry && !isCountryCode(a.Ctry)) out.push(`${role} bad country code`);
    if (party.iban && !isValidIBAN(party.iban)) out.push(`${role} IBAN invalid`);
    if (!party.iban && !party.account) out.push(`${role} account missing`);
    if (party.account && !/^\d+$/.test(party.account)) out.push(`${role} account format`);
  }
  for (const bic of [m.debtorAgentBic, m.creditorAgentBic]) {
    if (!bic || !directory.has(bic)) out.push(`BIC ${bic} not in directory`);
  }
  if (m.creditorAgentBic?.slice(4, 6) !== m.creditor.address?.Ctry) out.push("BIC country mismatch");
  if (corridor.purposeRequired && !m.purposeCode) out.push("purpose missing");
  if (m.purposeCode && !PURPOSE_CODE_SET.has(m.purposeCode)) out.push("purpose code not in ISO list");
  if (!corridor.allowedCurrencies.includes(m.currency ?? "")) out.push("currency not allowed");
  if (Number(m.amount) > corridor.maxAmount) out.push("amount over max");
  if (ZERO_DECIMAL_CURRENCIES.has(m.currency ?? "") && m.amount?.includes(".")) out.push("decimals on zero-decimal currency");
  if ((m.endToEndId ?? "").length > 35) out.push("EndToEndId too long");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.valueDate ?? "")) out.push("date format");
  return out;
}

describe("synthetic dataset", () => {
  it("is deterministic for a given seed and base date", () => {
    expect(hash()).toBe(hash());
  });

  it("has 300 prevent and 40 repair messages with unique ids", () => {
    expect(ds.payments.filter((p) => p.mode === "prevent")).toHaveLength(300);
    expect(ds.payments.filter((p) => p.mode === "repair")).toHaveLength(40);
    expect(new Set(ds.payments.map((p) => p.id)).size).toBe(340);
    expect(new Set(ds.payments.map((p) => p.transfer.uetr)).size).toBe(340);
  });

  it("seeds errors into about 30% of prevent messages and every repair message", () => {
    const preventErrored = ds.payments.filter((p) => p.mode === "prevent" && answered.has(p.id)).length;
    expect(preventErrored).toBe(93);
    expect(ds.payments.filter((p) => p.mode === "repair").every((p) => answered.has(p.id))).toBe(true);
  });

  it("covers all nine buckets", () => {
    expect(new Set(ds.answerKey.map((a) => a.bucket))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it("leaves every clean message genuinely clean", () => {
    const failures = ds.payments
      .filter((p) => !answered.has(p.id))
      .map((p) => ({ id: p.id, problems: problems(p) }))
      .filter((f) => f.problems.length > 0);
    expect(failures).toEqual([]);
  });

  it("makes every detectable seeded error actually visible in the message", () => {
    const invisible = ds.answerKey
      .filter((a) => a.detectablePreSend && ![7, 9].includes(a.bucket))
      .filter((a) => problems(ds.payments.find((p) => p.id === a.paymentId)!).length === 0)
      .map((a) => `${a.paymentId}:${a.variant}`);
    expect(invisible).toEqual([]);
  });

  it("links duplicates to an earlier, clean original with the same money details", () => {
    for (const a of ds.answerKey.filter((x) => x.bucket === 7)) {
      const dup = ds.payments.find((p) => p.id === a.paymentId)!;
      const orig = ds.payments.find((p) => p.id === a.relatedPaymentId)!;
      expect(orig).toBeDefined();
      expect(answered.has(orig.id)).toBe(false);
      expect(dup.createdOffsetMin).toBeLessThanOrEqual(orig.createdOffsetMin);
      expect([dup.transfer.amount, dup.transfer.currency, dup.transfer.creditor.name])
        .toEqual([orig.transfer.amount, orig.transfer.currency, orig.transfer.creditor.name]);
    }
  });

  it("builds a valid pacs.002 reject for every repair item", () => {
    for (const p of ds.payments.filter((x) => x.mode === "repair")) {
      const r = parseMessage(p.rejectXml!) as ParsedReject;
      expect(r.status).toBe("RJCT");
      expect(REASON_CODE_SET.has(r.reasonCode!)).toBe(true);
      expect(r.originalEndToEndId).toBe(p.transfer.endToEndId);
      expect(r.originalUetr).toBe(p.transfer.uetr);
    }
  });

  it("marks closed accounts as undetectable before sending and never auto-suggestable", () => {
    const closed = ds.answerKey.filter((a) => a.variant === "creditor_account_closed");
    expect(closed.length).toBeGreaterThan(0);
    expect(closed.every((a) => !a.detectablePreSend && !a.autoSuggestable)).toBe(true);
  });

  it("never marks account, amount or currency errors as auto-suggestable", () => {
    const money = ds.answerKey.filter((a) => /Acct|Amount/.test(a.fieldPath));
    expect(money.length).toBeGreaterThan(0);
    expect(money.some((a) => a.autoSuggestable)).toBe(false);
  });

  it("concentrates address errors in one client (Kaze) for the insights story", () => {
    const addr = ds.answerKey.filter((a) => a.bucket === 1 && a.paymentId.startsWith("PRV"));
    const kaze = addr.filter((a) => ds.payments.find((p) => p.id === a.paymentId)!.clientId === "CLT-001");
    const share = kaze.length / addr.length;
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.5);
  });
});
