import { diffLines } from "@/lib/iso/edit";

/** Side-by-side diff of two messages; unchanged stretches fold to 2 lines of context. */
export function XmlDiff({ before, after }: { before: string; after: string }) {
  const rows = diffLines(before, after);
  const changed = rows.map((r) => r.kind !== "same");
  const keep = rows.map((_, i) => changed.slice(Math.max(0, i - 2), i + 3).some(Boolean));
  let a = 0, b = 0;
  const out: ({ kind: "gap"; n: number } | { kind: "row"; r: (typeof rows)[number]; la?: number; lb?: number })[] = [];
  rows.forEach((r, i) => {
    const la = r.a !== undefined ? ++a : undefined;
    const lb = r.b !== undefined ? ++b : undefined;
    if (keep[i]) out.push({ kind: "row", r, la, lb });
    else {
      const last = out[out.length - 1];
      if (last?.kind === "gap") last.n++;
      else out.push({ kind: "gap", n: 1 });
    }
  });
  if (!changed.some(Boolean)) return <p className="text-sm text-muted">No changes yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-rule bg-paper">
      <table className="w-full min-w-[40rem] table-fixed border-collapse font-mono text-xs leading-5">
        <thead>
          <tr className="border-b border-rule text-left font-sans text-muted">
            <th className="w-8" aria-hidden />
            <th className="px-3 py-1.5 font-semibold">Before</th>
            <th className="w-8" aria-hidden />
            <th className="px-3 py-1.5 font-semibold">After</th>
          </tr>
        </thead>
        <tbody>
          {out.map((x, i) => x.kind === "gap" ? (
            <tr key={i}><td colSpan={4} className="px-3 py-0.5 font-sans text-muted">… {x.n} unchanged {x.n === 1 ? "line" : "lines"}</td></tr>
          ) : (
            <tr key={i}>
              <td className="w-8 select-none pr-2 text-right text-muted" aria-hidden>{x.la ?? ""}</td>
              <td className={`whitespace-pre-wrap break-all pr-3 ${x.r.kind === "del" ? "bg-rejected/15" : ""}`}>
                {x.r.kind === "del" && <span className="sr-only">Removed: </span>}{x.r.kind !== "add" ? x.r.a : ""}
              </td>
              <td className="w-8 select-none border-l border-rule pr-2 text-right text-muted" aria-hidden>{x.lb ?? ""}</td>
              <td className={`whitespace-pre-wrap break-all pr-3 ${x.r.kind === "add" ? "bg-clean/15" : ""}`}>
                {x.r.kind === "add" && <span className="sr-only">Added: </span>}{x.r.kind !== "del" ? x.r.b : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
