import { BUCKETS, type Bucket } from "@/lib/reference/buckets";

/** Failure type as a small label. Screening gets its own colour; everything else is neutral. */
export function BucketBadge({ bucket }: { bucket: number }) {
  const info = BUCKETS[bucket as Bucket];
  const tone =
    bucket === 9 ? "border-compliance text-compliance" : bucket === 7 ? "border-review text-review" : "border-rule text-ink";
  return (
    <span title={info?.label} className={`inline-block whitespace-nowrap rounded border px-1.5 py-px text-xs ${tone}`}>
      {info?.short ?? `Bucket ${bucket}`}
    </span>
  );
}
