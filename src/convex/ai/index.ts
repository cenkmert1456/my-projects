// AI provider factory for DROP.
//
// DROP is a zero-configuration consumer product. Resolution order:
//   1. DemoProvider — deterministic, keyless, on-device-compatible analyzer
//      (the SAME algorithm runs natively in the mobile apps via the DropAI
//      engine). This is the default: no keys, no servers, no setup.
//   2. Gemini — used only when GOOGLE_API_KEY is present. Optional; DROP
//      never requires it and never stops working without it.
//
// Ollama is intentionally NOT part of the product. The file `ollama.ts`
// remains only as a dev/diagnostic provider that is instantiated exclusively
// when `OLLAMA_BASE_URL` is explicitly set by a developer — it is never
// advertised, never defaulted, and never required anywhere.
//
// `resolveProvider()` is async so a configured-but-broken cloud provider can
// be probed and skipped; the demo analyzer is always the safe landing spot.

import type { AIHealth, AIProvider } from "./types";
import { DemoProvider, demoEmbedText } from "./demo";
import { GeminiProvider } from "./gemini";
import { OllamaProvider, ollamaConfig } from "./ollama";

let cached: AIProvider | null = null;
let resolvePromise: Promise<AIProvider> | null = null;
let lastResolvedAt = 0;
const RESOLVE_CACHE_MS = 90_000;

export function getProvider(): AIProvider {
  if (cached) return cached;
  const key = process.env.GOOGLE_API_KEY;
  cached = key ? new GeminiProvider(key) : new DemoProvider();
  return cached;
}

/**
 * Pick the best currently-available provider: Gemini when a key is configured
 * and reachable, otherwise the built-in deterministic analyzer. Async because
 * the optional cloud reachability probe is a network call.
 */
export async function resolveProvider(): Promise<AIProvider> {
  const now = Date.now();
  if (cached && now - lastResolvedAt < RESOLVE_CACHE_MS) {
    return cached;
  }

  // Optional cloud AI: Gemini when a key exists; otherwise the built-in
  // deterministic engine (the zero-config default). A cloud failure at
  // analysis time is caught by the pipeline and falls back to the built-in
  // engine — the product never depends on the cloud.
  cached = getProvider();
  lastResolvedAt = now;
  return cached;
}

/**
 * Developer-only access to a self-hosted Ollama server. Returns null unless
 * `OLLAMA_BASE_URL` is explicitly set (diagnostics / self-hosting). The
 * consumer product never uses this.
 */
export function devOllamaProvider(): AIProvider | null {
  if (!process.env.OLLAMA_BASE_URL) return null;
  return new OllamaProvider(ollamaConfig());
}

/** Detailed health report for the Settings → DROP Intelligence page. */
export async function checkAIHealth(): Promise<AIHealth> {
  const provider = await resolveProvider();
  if (provider.health) {
    return await provider.health();
  }
  const id = provider.id;
  if (id === "gemini") {
    return {
      ok: true,
      provider: "gemini",
      label: "Cloud intelligence · optional",
      local: false,
      models: {
        text: process.env.GEMINI_TEXT_MODEL ?? "gemini-1.5-flash",
        vision: process.env.GEMINI_VISION_MODEL ?? "gemini-1.5-flash",
        embedding: "text-embedding-004",
      },
    };
  }
  return {
    ok: true,
    provider: "demo",
    label: "DROP Intelligence · built-in engine",
    local: true,
    error: undefined,
  };
}

/** Re-evaluate which provider to use (called if env may have changed). */
export function resetProvider() {
  cached = null;
  resolvePromise = null;
  lastResolvedAt = 0;
}

export { demoEmbedText };
export type { AIProvider, AnalyzeInput, DropAnalysis, AIHealth } from "./types";
