import { DEMO_USERS } from "@/lib/auth";
import { FIELD_LABEL } from "@/components/repair-value";

const ACTION: Record<string, string> = {
  view: "Opened the payment",
  suggest: "Suggestions checked (OpenStreetMap, Gemini if needed)",
  start_repair: "Started a repair",
  accept_suggestion: "Accepted a suggestion",
  edit_suggestion: "Edited a suggestion",
  manual_edit: "Typed a value by hand",
  reject_suggestion: "Dismissed a suggestion",
  undo_change: "Undid a change",
  submit: "Submitted for approval",
  approve: "Approved",
  send_back: "Sent back to the maker",
  draft_client_message: "Copied the message to the client",
};

const who = (id: string) => DEMO_USERS.find((u) => u.id === id)?.name ?? id;

function summary(action: string, before: unknown, after: unknown): string | undefined {
  const a = (after ?? {}) as Record<string, unknown>;
  const b = (before ?? {}) as Record<string, unknown>;
  const field = (a.fieldPath ?? b.fieldPath) as string | undefined;
  const show = (v: unknown) => {
    if (v === null || v === undefined) return "nothing";
    if (typeof v === "string") return `"${v}"`;
    const a = v as { TwnNm?: string; Ctry?: string; AdrLine?: string[] };
    if (a.TwnNm || a.Ctry) return `${a.TwnNm ?? "no town"}, ${a.Ctry ?? "no country"}`;
    return a.AdrLine?.length ? "free text only" : "no address";
  };
  if (action === "start_repair" || action === "submit" || action === "approve" || action === "send_back") {
    const parts = [b.status && a.status ? `${b.status} → ${a.status}` : undefined, a.comment ? `“${a.comment}”` : undefined, a.needsRescreen ? "names or addresses changed: re-screen before release" : undefined];
    return parts.filter(Boolean).join(" · ") || undefined;
  }
  if (field) return `${FIELD_LABEL[field] ?? field}: ${show(b.value)} → ${show(a.value)}`;
  if (action === "suggest" && Array.isArray(a.suggestions)) return (a.suggestions as { fieldPath: string; source: string; confidence: number }[]).map((s) => `${FIELD_LABEL[s.fieldPath] ?? s.fieldPath} ${Math.round(s.confidence * 100)}% (${s.source})`).join("; ");
  return undefined;
}

export function AuditTrail({ entries }: { entries: { id: number; actorId: string; action: string; before: unknown; after: unknown; at: Date }[] }) {
  if (!entries.length) return <p className="text-sm text-muted">Nothing recorded for this payment yet.</p>;
  return (
    <ol className="flex flex-col">
      {entries.map((e) => (
        <li key={e.id} className="grid gap-x-4 border-b border-rule py-2 text-sm sm:grid-cols-[11rem_10rem_1fr]">
          <time className="font-mono text-xs text-muted" dateTime={e.at.toISOString()}>{e.at.toISOString().replace("T", " ").slice(0, 19)} UTC</time>
          <span className="font-semibold">{who(e.actorId)}</span>
          <span>
            {ACTION[e.action] ?? e.action}
            {summary(e.action, e.before, e.after) && <span className="block text-muted">{summary(e.action, e.before, e.after)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
