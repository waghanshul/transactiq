"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const msg = error instanceof Error ? error.message : "";
  const db = /DATABASE_URL|ECONNREFUSED|fetch failed|relation .* does not exist|connect/i.test(msg);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 py-10">
      <h1 className="text-xl font-bold">This page couldn&rsquo;t load</h1>
      <p className="text-sm text-muted">
        {db
          ? "The database didn't answer. The free Neon database sleeps after a few minutes idle and takes a few seconds to wake up; try again. If this is a new deployment, run the setup first."
          : "Something went wrong while loading this page. Nothing was changed."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => retry()} className="h-10 rounded-md bg-accent px-5 font-semibold text-surface">Try again</button>
        {db && <Link href="/setup" className="flex h-10 items-center rounded-md border border-rule px-5 font-semibold">Set up the demo</Link>}
        <Link href="/" className="flex h-10 items-center rounded-md border border-rule px-5 font-semibold">Home</Link>
      </div>
    </div>
  );
}
