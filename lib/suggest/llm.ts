// Address engine v2 (S3-03): Gemini Flash fallback, asked only when the rules
// are unsure. It receives the free-text address lines and nothing else: no
// names, accounts, amounts or references. The demo data is synthetic, but the
// boundary is the one a bank would need. Answers are cached by address hash,
// and any failure (no key, quota 429, timeout, bad output) returns a clear
// "unavailable" result instead of breaking the page.
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { isCountryCode } from "@/lib/reference/countries";
import { hashKey, type Cache } from "./cache";
import { suggestConfig } from "./config";

export const llmAddressSchema = z.object({
  town: z.string().describe("Town or city only, in Latin script, as used in a postal address"),
  country: z.string().describe("ISO 3166-1 alpha-2 country code, e.g. IN, JP, US"),
  street: z.string().optional().describe("Street, building and floor part, without town or country"),
  postcode: z.string().optional(),
  confidence: z.number().min(0).max(1).describe("How sure you are that town and country are right"),
  reasoning: z.string().describe("One short sentence"),
});
export type LlmAddress = z.infer<typeof llmAddressSchema>;

export type LlmResult =
  | { ok: true; value: LlmAddress; cached: boolean }
  | { ok: false; reason: string };

const PROMPT = `You structure postal addresses for cross-border payments (ISO 20022, Swift CBPR+).
From the free-text address lines below, identify the town (city) and the country.
Rules: return the town exactly as a postal town name in Latin script; return the
country as an ISO 3166-1 alpha-2 code; if you cannot tell, give a low confidence
rather than guessing. Do not invent a street or postcode that is not in the text.

Address lines:
`;

export async function askLlmForAddress(lines: string[], cache: Cache): Promise<LlmResult> {
  if (!suggestConfig.geminiEnabled) return { ok: false, reason: "Gemini is not configured (no GEMINI_API_KEY)." };
  const key = hashKey("gemini-address", { lines, model: suggestConfig.geminiModel });
  const hit = await cache.get<LlmAddress>(key);
  if (hit) return { ok: true, value: hit, cached: true };
  try {
    const google = createGoogleGenerativeAI({ apiKey: suggestConfig.geminiApiKey });
    const { output } = await generateText({
      model: google(suggestConfig.geminiModel),
      output: Output.object({ schema: llmAddressSchema }),
      prompt: PROMPT + lines.map((l) => `- ${l}`).join("\n"),
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(15_000),
    });
    const value = { ...output, country: output.country.toUpperCase() };
    if (!isCountryCode(value.country)) return { ok: false, reason: `Gemini returned "${output.country}", which is not a country code.` };
    await cache.set(key, "gemini", value);
    return { ok: true, value, cached: false };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) return { ok: false, reason: "Suggestion unavailable: the Gemini free-tier quota is used up for now. Try again later or fill the field by hand." };
    return { ok: false, reason: `Suggestion unavailable: ${err instanceof Error ? err.message.slice(0, 160) : "Gemini call failed"}.` };
  }
}
