// AI provider factory for DROP.
//
// Resolution order (cheapest → most capable):
//   1. Ollama (self-hosted, free) — used whenever OLLAMA_BASE_URL is set AND
//      the server is reachable. This is the default free / local AI mode.
//   2. Gemini — used when GOOGLE_API_KEY is set and Ollama is not configured
//      or unreachable.
//   3. DemoProvider — deterministic, keyless heuristic fallback so the product
//      always works.
//
// `resolveProvider()` is async: it health-checks Ollama before choosing it, so
// a misconfigured/offline local server never breaks the app — the pipeline
// falls back to the next provider and the Settings page shows a clean message.
// The result is cached briefly to avoid hammering the health endpoint.

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
  const ollama = process.env.OLLAMA_BASE_URL ? new OllamaProvider(ollamaConfig()) : null;
  const key = process.env.GOOGLE_API_KEY;
  cached = ollama ?? (key ? new GeminiProvider(key) : new DemoProvider());
  return cached;
}

/**
 * Pick the best currently-available provider. Ollama is preferred when its env
 * vars are set and the server answers; otherwise Gemini; otherwise demo.
 * Async because the Ollama reachability probe is a network call.
 */
export async function resolveProvider(): Promise<AIProvider> {
  const now = Date.now();
  if (cached && now - lastResolvedAt < RESOLVE_CACHE_MS) {
    return cached;
  }

  if (!process.env.OLLAMA_BASE_URL) {
    cached = getProvider();
    lastResolvedAt = now;
    return cached;
  }

  // Ollama is configured — probe it. Cache the probe result for a short while.
  if (resolvePromise) return resolvePromise;
  resolvePromise = (async () => {
    const ollama = new OllamaProvider(ollamaConfig());
    const reachable = await ollama.ping();
    if (reachable) {
      cached = ollama;
    } else {
      const key = process.env.GOOGLE_API_KEY;
      cached = key ? new GeminiProvider(key) : new DemoProvider();
    }
    lastResolvedAt = now;
    return cached;
  })().finally(() => {
    resolvePromise = null;
  });
  return resolvePromise;
}

/** Detailed health report for the AI & Privacy settings page. */
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
      label: "Google Gemini · cloud AI",
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
    label: "Built-in demo analyzer · no AI server",
    local: false,
    error: "No Ollama or Gemini configured. DROP runs its free deterministic analyzer — add a local Ollama server for real AI.",
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
