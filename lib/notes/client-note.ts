// Client feedback note (S4-02): tells a client which beneficiary records to fix
// in their own system so the same errors stop recurring.
// Gemini sees only anonymised facts ("Beneficiary B1: unstructured address on
// 5 payments"); real names are put back in afterwards, on our side. Without a
// Gemini key, or when it fails, a template writes the same note.
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { hashKey, type Cache } from "@/lib/suggest/cache";
import { suggestConfig } from "@/lib/suggest/config";

export interface NoteFacts {
  clientName: string;
  totalPayments: number;
  affectedPayments: number;
  beneficiaries: { name: string; payments: number; buckets: number[] }[];
}

const ASK: Record<number, string> = {
  1: "store the address with town, postcode and country in separate fields (not as free-text lines)",
  2: "add the missing name or postal address",
  3: "check the account number or IBAN",
  4: "check the bank code (BIC)",
  5: "add a valid ISO purpose code, for example GDDS for goods or SUPP for supplier payments",
  6: "use plain Latin characters and keep references to 35 characters",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function templateNote(f: NoteFacts): string {
  const top = f.beneficiaries.slice(0, 8);
  const lines = top.map((b) => `- ${b.name} (${plural(b.payments, "payment")}): please ${b.buckets.map((x) => ASK[x]).filter(Boolean).join("; and ")}.`);
  return [
    `Dear ${f.clientName} team,`,
    "",
    `We checked your recent cross-border payments before sending them. ${plural(f.affectedPayments, "payment")} out of ${f.totalPayments} needed a manual correction by our team because of details in your beneficiary records, mostly for the same few beneficiaries. Fixing these records once in your system will stop the errors from coming back.`,
    "",
    "Records to update:",
    ...lines,
    "",
    "From 14 November 2026, Swift rejects payments whose addresses are only free text, so the address updates are the most urgent.",
    "",
    "We are happy to go through the list with your accounts payable team.",
    "",
    "Kind regards,",
    "Payments Operations",
  ].join("\n");
}

/** The facts with every name replaced by a placeholder. */
export function anonymise(f: NoteFacts) {
  return {
    totalPayments: f.totalPayments,
    affectedPayments: f.affectedPayments,
    beneficiaries: f.beneficiaries.slice(0, 8).map((b, i) => ({ ref: `B${i + 1}`, payments: b.payments, problems: b.buckets.map((x) => ASK[x]).filter(Boolean) })),
  };
}

export function restoreNames(text: string, f: NoteFacts): string {
  let out = text.replace(/\[CLIENT\]/g, f.clientName);
  f.beneficiaries.slice(0, 8).forEach((b, i) => { out = out.replace(new RegExp(`\\[?B${i + 1}\\]?(?!\\d)`, "g"), b.name); });
  return out;
}

export async function draftNote(f: NoteFacts, cache: Cache): Promise<{ body: string; source: "llm" | "template"; note?: string }> {
  if (!suggestConfig.geminiEnabled) return { body: templateNote(f), source: "template" };
  const facts = anonymise(f);
  const key = hashKey("gemini-note", { facts, model: suggestConfig.geminiModel });
  const cached = await cache.get<string>(key);
  if (cached) return { body: restoreNames(cached, f), source: "llm", note: "Reused a cached draft." };
  try {
    const google = createGoogleGenerativeAI({ apiKey: suggestConfig.geminiApiKey });
    const { text } = await generateText({
      model: google(suggestConfig.geminiModel),
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(20_000),
      prompt: `Write a short, polite email from a bank's payments operations team to a corporate client ([CLIENT]).
Purpose: ask them to fix specific beneficiary records in their own system so payment errors stop recurring.
Facts (JSON): ${JSON.stringify(facts)}
Rules: address the client as [CLIENT]; refer to each beneficiary only by its ref (B1, B2...); one bullet per beneficiary with what to fix;
mention that from 14 November 2026 Swift rejects payments with free-text-only addresses; no subject line; plain text; under 200 words;
sign off as "Payments Operations". Do not invent facts, amounts or account numbers.`,
    });
    await cache.set(key, "gemini", text);
    return { body: restoreNames(text, f), source: "llm" };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    return { body: templateNote(f), source: "template", note: status === 429 ? "Gemini quota used up; used the template instead." : "Gemini unavailable; used the template instead." };
  }
}

/** Sends through Resend to your own inbox. Needs RESEND_API_KEY and NOTE_TO_EMAIL. */
export async function sendNote(subject: string, body: string): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTE_TO_EMAIL;
  if (!key || !to) return { sent: false, reason: "Email isn't set up (RESEND_API_KEY and NOTE_TO_EMAIL), so the note was approved but not emailed." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.NOTE_FROM_EMAIL || "TransactIQ demo <onboarding@resend.dev>", to: [to], subject, text: `[SYNTHETIC DEMO DATA]\n\n${body}` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { sent: false, reason: `Resend answered ${res.status}: ${(await res.text()).slice(0, 160)}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: `Couldn't reach Resend (${err instanceof Error ? err.message : "network error"}).` };
  }
}
