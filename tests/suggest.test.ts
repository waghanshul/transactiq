// Sprint 3 gate: suggestions fix what they claim to fix, address suggestions
// are right at least 95% of the time, and the guardrails hold.
// The answer key is read here only to SCORE the suggestions.
import { describe, expect, it } from "vitest";
import { applyChange, applyChanges, diffLines } from "@/lib/iso/edit";
import { parseMessage, type ParsedTransfer } from "@/lib/iso/parse";
import { BANKS } from "@/lib/reference/banks";
import { CORRIDORS } from "@/lib/reference/corridors";
import { checkBatch } from "@/lib/rules/engine";
import { staticReference } from "@/lib/rules/reference";
import { analyseAddressLines } from "@/lib/suggest/address";
import { suggestConfig } from "@/lib/suggest/config";
import { contextBuilder } from "@/lib/suggest/context";
import { repairFieldFor, suggestForPayment } from "@/lib/suggest/engine";
import { assertCanChange, canSuggest, GuardrailError, isEditableField } from "@/lib/suggest/guardrails";
import { revalidate } from "@/lib/suggest/revalidate";
import { scoreSuggestions } from "@/lib/suggest/score";
import type { Suggestion } from "@/lib/suggest/types";
import { addressTestSet } from "@/lib/synth/address-testset";
import { generateDataset } from "@/lib/synth/generate";

const BASE = new Date("2026-11-02T06:00:00Z");
const ds = generateDataset({ baseDate: BASE });
const ref = staticReference();
const at = (offset: number) => new Date(BASE.getTime() - offset * 60_000);

const rows = ds.payments.map((p) => ({
  ...p, receivedAt: at(p.createdOffsetMin), msg: parseMessage(p.xml) as ParsedTransfer,
}));
const ctxFor = contextBuilder({
  payments: rows,
  clients: ds.clients.map((c) => ({ id: c.id, name: c.name, address: c.address, agentBic: c.agentBic })),
  beneficiaries: ds.beneficiaries.map((b) => ({ id: b.id, name: b.name, address: b.address, agentBic: b.agentBic })),
  bics: BANKS.map((b) => ({ bic: b.bic, country: b.country, name: b.name })),
  corridorCountry: Object.fromEntries(CORRIDORS.map((c) => [c.id, c.creditorCountry])),
});

const checked = new Map([
  ...checkBatch(rows.filter((r) => r.mode === "prevent"), ref),
  ...checkBatch(rows.filter((r) => r.mode === "repair"), ref),
]);

const all = rows.map((r) => {
  const result = checked.get(r.id)!;
  const status = r.mode === "repair" ? "rejected" : result.outcome === "compliance" ? "compliance" : "flagged";
  return { r, findings: result.findings, status, suggestions: suggestForPayment(r.msg, result.findings, status, ctxFor(r.id)!) };
});
const shown = (s: Suggestion) => s.confidence >= suggestConfig.minConfidence;

describe("suggestions on the seeded payments", () => {
  it("address suggestions shown to the analyst are at least 95% right (town and country)", () => {
    const flat = all.flatMap((x) => x.suggestions.map((s) => ({ ...s, paymentId: x.r.id })));
    const score = scoreSuggestions(ds.answerKey, flat, suggestConfig.minConfidence);
    expect(score.address.shown).toBeGreaterThan(30);
    expect(score.address.right / score.address.shown).toBeGreaterThanOrEqual(0.95);
    expect(score.other.right).toBe(score.other.shown);
    expect(score.coverage.withSuggestion).toBe(score.coverage.fixable);
  });

  it("every fixable seeded error gets a suggestion that clears it, without adding a new error", () => {
    const failures: string[] = [];
    for (const k of ds.answerKey.filter((a) => a.autoSuggestable)) {
      const x = all.find((y) => y.r.id === k.paymentId)!;
      const use = x.suggestions.filter(shown);
      const xml = applyChanges(x.r.xml, x.r.msgType, use.map((s) => ({ fieldPath: s.fieldPath, newValue: s.newValue })));
      const after = revalidate(x.r, xml, ref).findings;
      const fixable = after.filter((f) => repairFieldFor(f));
      if (fixable.length) failures.push(`${k.paymentId} ${k.variant}: ${fixable.map((f) => f.ruleId).join(", ")}`);
    }
    expect(failures).toEqual([]);
  });

  it("suggests the value the answer key expects for BICs, purpose codes, names and dates", () => {
    const wrong: string[] = [];
    for (const k of ds.answerKey.filter((a) => a.autoSuggestable && [4, 5, 6].includes(a.bucket))) {
      const fix = k.expectedFix as Record<string, string>;
      const x = all.find((y) => y.r.id === k.paymentId)!;
      const val = (f: string) => x.suggestions.find((s) => s.fieldPath === f)?.newValue;
      const got = fix.bic ? val("CdtrAgt/FinInstnId/BICFI") : fix.purposeCode ? val("Purp/Cd") : fix.name ? val("Cdtr/Nm")
        : fix.valueDate ? val("ValueDate") : fix.endToEndId ? val("PmtId/EndToEndId") : undefined;
      const want = fix.bic ?? fix.purposeCode ?? fix.name ?? fix.valueDate ?? fix.endToEndId;
      if (got !== want) wrong.push(`${k.paymentId} ${k.variant}: got ${JSON.stringify(got)}, want ${want}`);
    }
    expect(wrong).toEqual([]);
  });
});

describe("guardrails (S3-08)", () => {
  it("never suggests a change to an account, amount or currency", () => {
    for (const x of all) for (const s of x.suggestions) {
      expect(s.fieldPath).not.toMatch(/Acct|IBAN|Amt|Ccy|Amount/);
      expect(isEditableField(s.fieldPath)).toBe(true);
    }
  });

  it("never suggests anything on a payment sent to compliance", () => {
    const comp = all.filter((x) => x.status === "compliance");
    expect(comp.length).toBe(3);
    for (const x of comp) expect(x.suggestions).toEqual([]);
    expect(canSuggest("compliance", [])).toBe(false);
  });

  it("gives no value for account and amount problems (ask the client instead)", () => {
    for (const k of ds.answerKey.filter((a) => a.bucket === 3 || a.variant === "jpy_amount_with_decimals")) {
      const x = all.find((y) => y.r.id === k.paymentId)!;
      expect(x.suggestions.some((s) => /Acct|Amt/.test(s.fieldPath))).toBe(false);
    }
  });

  it("refuses protected fields and compliance payments at the write path too", () => {
    expect(() => assertCanChange("flagged", "CdtrAcct/Id/IBAN")).toThrow(GuardrailError);
    expect(() => assertCanChange("flagged", "Amt/InstdAmt")).toThrow(GuardrailError);
    expect(() => assertCanChange("compliance", "Cdtr/PstlAdr")).toThrow(GuardrailError);
    expect(() => assertCanChange("flagged", "Cdtr/PstlAdr")).not.toThrow();
  });
});

describe("address engine v1 on the 150-address test set", () => {
  const set = addressTestSet();
  const results = set.map((t) => ({ t, a: analyseAddressLines(t.lines) }));
  const isRight = (x: (typeof results)[number]) => x.a.town?.toLowerCase() === x.t.town.toLowerCase() && x.a.country === x.t.country;

  it("has 150 addresses", () => expect(set.length).toBe(150));
  it("is right on at least 95% of the suggestions it shows", () => {
    const s = results.filter((x) => x.a.confidence >= suggestConfig.minConfidence);
    expect(s.filter(isRight).length / s.length).toBeGreaterThanOrEqual(0.95);
  });
  it("says it is unsure, rather than guessing, for towns it doesn't know", () => {
    for (const x of results.filter((r) => r.t.style === "town not in reference list")) {
      expect(x.a.confidence).toBeLessThan(suggestConfig.minConfidence);
    }
  });
});

describe("XML editing", () => {
  const p = ds.payments.find((x) => x.mode === "prevent" && x.msgType === "pain.001")!;
  it("adds a purpose code where there was none", () => {
    const noPurp = p.xml.replace(/\s*<Purp>[\s\S]*?<\/Purp>/, "");
    const out = applyChange(noPurp, "pain.001", "Purp/Cd", "GDDS");
    expect((parseMessage(out) as ParsedTransfer).purposeCode).toBe("GDDS");
  });
  it("adds a postal address after the name when it is missing", () => {
    const noAdr = p.xml.replace(/(<Cdtr>\s*<Nm>[^<]*<\/Nm>)\s*<PstlAdr>[\s\S]*?<\/PstlAdr>/, "$1");
    const out = applyChange(noAdr, "pain.001", "Cdtr/PstlAdr", { TwnNm: "Pune", Ctry: "IN" });
    expect((parseMessage(out) as ParsedTransfer).creditor.address).toEqual({ TwnNm: "Pune", Ctry: "IN" });
  });
  it("changes only the edited lines", () => {
    const out = applyChange(p.xml, "pain.001", "PmtId/EndToEndId", "NEW-REF-1");
    const d = diffLines(p.xml, out);
    expect(d.filter((l) => l.kind !== "same").length).toBe(2);
  });
});
