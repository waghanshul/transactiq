import Link from "next/link";
import { connection } from "next/server";
import { overview } from "@/lib/data/payments";
import { relativeCutoff } from "@/lib/format";

/** The earliest upcoming cut-off across all payments: the number ops watch all day. */
export async function CutoffClock() {
  await connection();
  const now = new Date();
  let next: { id: string; cutoffAt: Date } | undefined;
  try {
    next = (await overview(now)).next;
  } catch {
    return <span className="text-sm text-muted">Database not connected</span>;
  }
  if (!next) return <span className="text-sm text-muted">No cut-offs pending</span>;
  const urgent = next.cutoffAt.getTime() - now.getTime() < 60 * 60_000;
  return (
    <Link href={`/payments?view=${next.id}`} className="group flex items-baseline gap-2 text-sm">
      <span className="text-muted">Next cut-off</span>
      <span className={`text-base font-bold ${urgent ? "text-rejected" : "text-ink"}`}>
        {relativeCutoff(next.cutoffAt, now)}
      </span>
      <span className="font-mono text-xs text-muted group-hover:text-accent">{next.id}</span>
    </Link>
  );
}
