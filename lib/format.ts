// Display helpers shared by the pages.

export const STATUS_LABEL: Record<string, string> = {
  new: "Not checked",
  ready: "Passed checks",
  flagged: "Needs repair",
  in_repair: "In repair",
  pending_check: "Waiting for checker",
  approved: "Approved",
  released_sim: "Released (simulated)",
  held: "Held",
  compliance: "Sent to compliance",
  rejected: "Rejected by receiving bank",
};

/** Tailwind text colour per status; colour always means something. */
export const STATUS_TONE: Record<string, string> = {
  new: "text-muted",
  ready: "text-clean",
  flagged: "text-review",
  in_repair: "text-review",
  pending_check: "text-review",
  approved: "text-clean",
  released_sim: "text-clean",
  held: "text-review",
  compliance: "text-compliance",
  rejected: "text-rejected",
};

export const MSG_LABEL: Record<string, string> = {
  "pain.001": "Client instruction",
  "pacs.008": "Bank-to-bank transfer",
  "pacs.002": "Status report",
};

/** Formats a decimal string with grouping, keeping malformed values visible as-is. */
export function formatAmount(amount: string): string {
  if (!/^\d+(\.\d+)?$/.test(amount)) return amount;
  const [whole, frac] = amount.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === undefined ? grouped : `${grouped}.${frac}`;
}

/** "in 2 h 05 min" / "12 min ago" relative to `now`. */
export function relativeCutoff(cutoff: Date, now: Date): string {
  const mins = Math.round((cutoff.getTime() - now.getTime()) / 60_000);
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const span = h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
  return mins >= 0 ? `in ${span}` : `${span} ago`;
}
