// Read-only XML viewer with line numbers. Sprint 2 adds highlighting of the
// failing field via `highlightLines`.
export function XmlView({ xml, highlightLines = [] }: { xml: string; highlightLines?: number[] }) {
  const lines = xml.replace(/\n$/, "").split("\n");
  const marked = new Set(highlightLines);
  return (
    <pre className="max-h-[32rem] overflow-auto rounded-lg border border-rule bg-paper py-2 font-mono text-xs leading-5">
      <code>
        {lines.map((line, i) => (
          <span key={i} className={`flex ${marked.has(i + 1) ? "bg-review/15" : ""}`}>
            <span aria-hidden className="w-10 shrink-0 select-none pr-3 text-right text-muted">{i + 1}</span>
            <span className="whitespace-pre pr-4">{line}</span>
          </span>
        ))}
      </code>
    </pre>
  );
}
