import { createGoogle } from "@ai-sdk/google";

// All AI features use the Gemini API directly (user preference).
// Key comes from GEMINI_API_KEY (or the provider default
// GOOGLE_GENERATIVE_AI_API_KEY) in .env.local / project env.
const google = createGoogle({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

/** Document extraction: fast, strong multimodal (PDF/image) support. */
export const EXTRACTION_MODEL = google("gemini-2.5-flash");

/** Financial advisor agent: strongest reasoning over tool results. */
export const ADVISOR_MODEL = google("gemini-2.5-pro");

/** Cheap utility tasks (conversation titles, dashboard insights). */
export const CHEAP_MODEL = google("gemini-2.5-flash");

export function hasGeminiKey(): boolean {
  return !!(
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  );
}
