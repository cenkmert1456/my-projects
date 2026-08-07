// AI provider factory for DROP.
//
//   - GOOGLE_API_KEY set  → GeminiProvider (real multimodal analysis)
//   - otherwise          → DemoProvider (deterministic, keyless)
//
// To add another provider later: implement AIProvider in a new file and
// return it here based on its env var.

import type { AIProvider } from "./types";
import { DemoProvider, demoEmbedText } from "./demo";
import { GeminiProvider } from "./gemini";

let cached: AIProvider | null = null;

export function getProvider(): AIProvider {
  if (cached) return cached;
  const key = process.env.GOOGLE_API_KEY;
  cached = key ? new GeminiProvider(key) : new DemoProvider();
  return cached;
}

/** Re-evaluate which provider to use (called if env may have changed). */
export function resetProvider() {
  cached = null;
}

export { demoEmbedText };
export type { AIProvider, AnalyzeInput, DropAnalysis } from "./types";
