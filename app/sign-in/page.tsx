import { Suspense } from "react";
import { DEMO_USERS } from "@/lib/auth";
import { signInAs } from "./actions";

type Search = Promise<Record<string, string | string[] | undefined>>;

const ROLE_LABEL = { maker: "Maker", checker: "Checker", viewer: "Viewer" } as const;

export default function SignInPage({ searchParams }: { searchParams: Search }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 py-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Choose who you are</h1>
        <p className="mt-1 text-sm text-muted">
          Demo users, so one person can play both sides of maker-checker. The role is checked on the server for every
          action: a maker can&rsquo;t approve, and nobody can approve a repair they worked on.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <Users searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Users({ searchParams }: { searchParams: Search }) {
  const raw = (await searchParams).next;
  const next = Array.isArray(raw) ? raw[0] : raw;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {DEMO_USERS.map((u) => (
        <li key={u.id}>
          <form action={signInAs} className="h-full">
            <input type="hidden" name="userId" value={u.id} />
            <input type="hidden" name="next" value={next ?? "/queue"} />
            <button type="submit" className="flex h-full w-full flex-col items-start rounded-lg border border-rule bg-surface p-4 text-left hover:border-accent">
              <span className="text-xs font-semibold uppercase tracking-wide text-accent">{ROLE_LABEL[u.role]}</span>
              <span className="mt-1 font-semibold">{u.name}</span>
              <span className="font-mono text-xs text-muted">{u.id}</span>
              <span className="mt-2 text-sm text-muted">{u.blurb}</span>
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
