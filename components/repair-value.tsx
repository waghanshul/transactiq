// Display helpers for repair values (shared by server and client components).
import type { PostalAddress } from "@/lib/iso/types";

export const FIELD_LABEL: Record<string, string> = {
  "Cdtr/PstlAdr": "Creditor address",
  "Dbtr/PstlAdr": "Debtor address",
  "Cdtr/Nm": "Creditor name",
  "Dbtr/Nm": "Debtor name",
  "CdtrAgt/FinInstnId/BICFI": "Creditor's bank (BIC)",
  "DbtrAgt/FinInstnId/BICFI": "Debtor's bank (BIC)",
  "Purp/Cd": "Purpose code",
  "PmtId/EndToEndId": "End-to-end reference",
  ValueDate: "Value date",
};

export const SOURCE_LABEL: Record<string, { label: string; hint: string }> = {
  rule: { label: "Rule", hint: "A fixed transformation of what is already in the message" },
  master: { label: "Bank record", hint: "The client or beneficiary record the bank holds" },
  history: { label: "Client history", hint: "This client's other payments" },
  directory: { label: "BIC directory", hint: "The bank identifier directory" },
  gazetteer: { label: "Town & postcode lists", hint: "Reference lists of towns and postcode formats" },
  llm: { label: "Gemini (AI)", hint: "Asked only because the rules were unsure; check before accepting" },
};

const ADDRESS_ORDER: (keyof PostalAddress)[] = ["StrtNm", "BldgNb", "BldgNm", "Flr", "PstBx", "PstCd", "TwnNm", "DstrctNm", "CtrySubDvsn", "Ctry"];

export function ValueView({ value, empty = "Missing", highlight }: { value: unknown; empty?: string; highlight?: unknown }) {
  if (value === undefined || value === null || value === "") return <span className="text-review">{empty}</span>;
  if (typeof value === "string") {
    const changed = highlight !== undefined && highlight !== value;
    return <span className={`break-all font-mono text-sm ${changed ? "font-semibold" : ""}`}>{value}</span>;
  }
  const a = value as PostalAddress;
  const h = (highlight ?? {}) as PostalAddress;
  const rows: [string, string, boolean][] = [];
  for (const k of ADDRESS_ORDER) if (a[k]) rows.push([k, a[k] as string, highlight !== undefined && h[k] !== a[k]]);
  (a.AdrLine ?? []).forEach((l, i) => rows.push([`AdrLine ${i + 1}`, l, highlight !== undefined && h.AdrLine?.[i] !== l]));
  if (!rows.length) return <span className="text-review">{empty}</span>;
  return (
    <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-0.5 text-sm">
      {rows.map(([k, v, changed]) => (
        <div key={k} className="contents">
          <dt className="font-mono text-xs leading-5 text-muted">{k}</dt>
          <dd className={`break-words ${changed ? "font-semibold" : ""}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ConfidenceBar({ value, threshold }: { value: number; threshold: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.9 ? "bg-clean" : value >= threshold ? "bg-accent" : "bg-review";
  return (
    <span className="flex items-center gap-2" title={`Shown as a suggestion from ${Math.round(threshold * 100)}%`}>
      <span className="relative block h-2 w-28 rounded-full bg-accent-soft" aria-hidden>
        <span className={`absolute inset-y-0 left-0 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
        <span className="absolute inset-y-[-2px] w-px bg-ink/40" style={{ left: `${Math.round(threshold * 100)}%` }} />
      </span>
      <span className="text-sm tabular-nums">{pct}% confident</span>
    </span>
  );
}
