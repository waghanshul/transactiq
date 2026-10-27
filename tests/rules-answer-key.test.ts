// The main Sprint 2 gate: run every rule over the full synthetic dataset and
// compare with the answer key. Target: every detectable seeded error caught in
// the right bucket, and no findings on clean payments.
import { describe, expect, it } from "vitest";
import { parseMessage, type ParsedTransfer } from "@/lib/iso/parse";
import { checkBatch, rejectBucket } from "@/lib/rules/engine";
import { evaluate } from "@/lib/rules/evaluate";
import { staticReference } from "@/lib/rules/reference";
import type { CheckablePayment } from "@/lib/rules/types";
import { generateDataset } from "@/lib/synth/generate";

const BASE = new Date("2026-11-02T06:00:00Z");
const ds = generateDataset({ baseDate: BASE });
const ref = staticReference();

function toCheckable(mode: "prevent" | "repair"): CheckablePayment[] {
  return ds.payments
    .filter((p) => p.mode === mode)
    .map((p) => ({
      id: p.id,
      msgType: p.msgType,
      clientId: p.clientId,
      corridor: p.corridor,
      receivedAt: new Date(BASE.getTime() - p.createdOffsetMin * 60_000),
      msg: parseMessage(p.xml) as ParsedTransfer,
    }));
}

const prevent = checkBatch(toCheckable("prevent"), ref);
const repair = checkBatch(toCheckable("repair"), ref);

const results = [
  ...[...prevent].map(([id, r]) => ({ paymentId: id, mode: "prevent" as const, buckets: r.findings.map((f) => f.bucket) })),
  ...[...repair].map(([id, r]) => {
    const code = ds.payments.find((p) => p.id === id)!.rejectReasonCode ?? null;
    return { paymentId: id, mode: "repair" as const, buckets: r.findings.map((f) => f.bucket), rejectBucket: rejectBucket(code, r.findings) };
  }),
];
const ev = evaluate(ds.answerKey, results);

describe("rules vs answer key", () => {
  it("catches every detectable seeded error in Prevent mode, in the right bucket", () => {
    expect(ev.prevent.missed.map((m) => `${m.paymentId}:${m.variant}`)).toEqual([]);
    expect(ev.prevent.caught).toBe(ev.prevent.seeded);
    expect(ev.prevent.seeded).toBe(93);
  });

  it("raises no findings on clean payments", () => {
    expect(ev.prevent.falsePositives).toEqual([]);
    expect(ev.prevent.cleanPayments).toBe(207);
  });

  it("raises no findings outside the seeded bucket on errored payments", () => {
    expect(ev.prevent.extraFindings).toEqual([]);
  });

  it("routes exactly the three screening look-alikes to compliance", () => {
    const routed = [...prevent].filter(([, r]) => r.outcome === "compliance").map(([id]) => id).sort();
    const expected = ds.answerKey.filter((a) => a.bucket === 9).map((a) => a.paymentId).sort();
    expect(routed).toEqual(expected);
  });

  it("holds exactly the five duplicates and never their originals", () => {
    const held = [...prevent].filter(([, r]) => r.outcome === "held").map(([id]) => id).sort();
    const dups = ds.answerKey.filter((a) => a.bucket === 7);
    expect(held).toEqual(dups.map((a) => a.paymentId).sort());
    for (const d of dups) expect(prevent.get(d.relatedPaymentId!)!.outcome).toBe("ready");
  });

  it("explains every rejected payment with the right bucket", () => {
    expect(ev.repair.explained).toBe(ev.repair.total);
    expect(ev.repair.total).toBe(40);
  });

  it("would have caught every detectable repair-mode error before sending", () => {
    expect(ev.repair.caughtBeforeSending).toBe(ev.repair.detectableBeforeSending);
    expect(ev.repair.detectableBeforeSending).toBeLessThan(ev.repair.total); // closed accounts aren't visible
  });

  it("gives every finding a plain message, a field path and (except screening) a reason code", () => {
    for (const r of [...prevent.values(), ...repair.values()]) {
      for (const f of r.findings) {
        expect(f.message.length).toBeGreaterThan(20);
        expect(f.fieldPath.length).toBeGreaterThan(0);
        if (f.bucket !== 9) expect(f.reasonCode).toMatch(/^[A-Z]{2}\d{2}$/);
      }
    }
  });
});
