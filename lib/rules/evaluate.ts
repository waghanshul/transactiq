// Scores rule findings against the answer key. Used by the metrics page and
// the tests. This is the only place outside the seed that reads the answer
// key, and it only reads it AFTER the rules have run.
import type { Bucket } from "@/lib/reference/buckets";

export interface KeyRow {
  paymentId: string;
  bucket: number;
  variant: string;
  detectablePreSend: boolean;
}

export interface PaymentFindings {
  paymentId: string;
  mode: "prevent" | "repair";
  buckets: number[];
  /** Repair mode only: bucket explained by the pacs.002 reason code. */
  rejectBucket?: number | null;
}

export interface BucketScore {
  bucket: number;
  seeded: number;
  caught: number;
}

export interface Evaluation {
  prevent: {
    seeded: number;
    caught: number;
    missed: KeyRow[];
    byBucket: BucketScore[];
    /** Payments with no seeded error that the rules flagged anyway. */
    falsePositives: { paymentId: string; buckets: number[] }[];
    /** Extra findings in a different bucket on a payment that did have a seeded error. */
    extraFindings: { paymentId: string; expected: number; extra: number[] }[];
    cleanPayments: number;
  };
  repair: {
    total: number;
    explained: number;
    detectableBeforeSending: number;
    caughtBeforeSending: number;
  };
}

export function evaluate(key: KeyRow[], results: PaymentFindings[]): Evaluation {
  const keyBy = new Map(key.map((k) => [k.paymentId, k]));
  const prevent = results.filter((r) => r.mode === "prevent");
  const repair = results.filter((r) => r.mode === "repair");

  const preventKey = key.filter((k) => keyBy.has(k.paymentId) && prevent.some((r) => r.paymentId === k.paymentId));
  const found = new Map(results.map((r) => [r.paymentId, r]));

  const detectable = preventKey.filter((k) => k.detectablePreSend);
  const missed = detectable.filter((k) => !found.get(k.paymentId)?.buckets.includes(k.bucket));

  const bucketIds = Array.from(new Set(detectable.map((k) => k.bucket))).sort((a, b) => a - b);
  const byBucket = bucketIds.map((b) => {
    const rows = detectable.filter((k) => k.bucket === b);
    return { bucket: b, seeded: rows.length, caught: rows.filter((k) => !missed.includes(k)).length };
  });

  const falsePositives = prevent
    .filter((r) => !keyBy.has(r.paymentId) && r.buckets.length > 0)
    .map((r) => ({ paymentId: r.paymentId, buckets: Array.from(new Set(r.buckets)) }));

  const extraFindings = prevent
    .filter((r) => keyBy.has(r.paymentId))
    .map((r) => {
      const expected = keyBy.get(r.paymentId)!.bucket;
      return { paymentId: r.paymentId, expected, extra: Array.from(new Set(r.buckets.filter((b) => b !== expected))) };
    })
    .filter((x) => x.extra.length > 0);

  const repairKey = repair.map((r) => ({ r, k: keyBy.get(r.paymentId) })).filter((x) => x.k);
  const explained = repairKey.filter(({ r, k }) => r.rejectBucket === k!.bucket).length;
  const repairDetectable = repairKey.filter(({ k }) => k!.detectablePreSend);
  const repairCaught = repairDetectable.filter(({ r, k }) => r.buckets.includes(k!.bucket)).length;

  return {
    prevent: {
      seeded: detectable.length,
      caught: detectable.length - missed.length,
      missed,
      byBucket,
      falsePositives,
      extraFindings,
      cleanPayments: prevent.filter((r) => !keyBy.has(r.paymentId)).length,
    },
    repair: {
      total: repair.length,
      explained,
      detectableBeforeSending: repairDetectable.length,
      caughtBeforeSending: repairCaught,
    },
  };
}

export type { Bucket };
