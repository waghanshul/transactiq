"use client";

// Filter bar for the payments list. Plain GET form so filters live in the URL
// (shareable, back-button friendly); selects re-submit on change.
interface Option { value: string; label: string }

interface Props {
  values: Record<string, string | undefined>;
  selects: { name: string; label: string; options: Option[] }[];
}

export function FilterForm({ values, selects }: Props) {
  return (
    <form method="get" action="/payments" className="flex flex-wrap items-end gap-3" role="search">
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted">
        Search
        <input
          type="search"
          name="q"
          defaultValue={values.q}
          placeholder="ID, reference or name"
          className="h-9 rounded-md border border-rule bg-surface px-3 text-sm text-ink placeholder:text-muted"
        />
      </label>
      {selects.map((s) => (
        <label key={s.name} className="flex flex-col gap-1 text-xs text-muted">
          {s.label}
          <select
            name={s.name}
            defaultValue={values[s.name] ?? ""}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="h-9 rounded-md border border-rule bg-surface px-2 text-sm text-ink"
          >
            <option value="">All</option>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      ))}
      <button type="submit" className="h-9 rounded-md bg-accent px-4 text-sm font-semibold text-surface">
        Apply filters
      </button>
      <a href="/payments" className="h-9 px-2 text-sm leading-9 text-muted underline-offset-4 hover:underline">
        Clear
      </a>
    </form>
  );
}
