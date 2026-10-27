"use server";

import { refresh } from "next/cache";
import { getDb } from "@/lib/db/client";
import { runChecks, type RunSummary } from "@/lib/data/checks";

export interface RunState {
  ok: boolean;
  message: string;
  summary?: RunSummary;
}

/** Runs every pre-send check over the batch. Safe to repeat: results are replaced. */
export async function runChecksAction(): Promise<RunState> {
  try {
    const summary = await runChecks(getDb(), "demo-user");
    refresh();
    return { ok: true, message: "Checks finished.", summary };
  } catch (err) {
    return { ok: false, message: `Checks failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
