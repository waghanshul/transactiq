// Suggestion settings that can change without a code change: set the
// environment variable in Vercel (Settings > Environment Variables) and redeploy.

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
};

export const suggestConfig = {
  /** Below this confidence the panel shows options or a blank field, never a guess. */
  minConfidence: num(process.env.SUGGESTION_MIN_CONFIDENCE, 0.7),
  /** The address engine asks Gemini only when its own confidence is below this. */
  llmBelow: num(process.env.SUGGESTION_LLM_BELOW, 0.8),
  geminiModel: process.env.GEMINI_MODEL || "gemini-flash-latest",
  /** GEMINI_API_KEY (as in .env.example) or the AI SDK's default GOOGLE_GENERATIVE_AI_API_KEY. */
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
  get geminiEnabled() { return Boolean(this.geminiApiKey); },
  /** Set NOMINATIM_DISABLED=1 to skip the OpenStreetMap cross-check (e.g. offline). */
  nominatimEnabled: process.env.NOMINATIM_DISABLED !== "1",
};
