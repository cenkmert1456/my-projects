// Robust parsing helpers for LLM output. Models sometimes wrap JSON in
// code fences, add prose, or emit slightly-off values — normalize everything
// here so a malformed response degrades gracefully instead of failing the
// whole Drop.

import { isCategory } from "../lib/constants";
import type { DropAnalysis, Entity } from "./types";

/** Extract a JSON object from a model response that may contain prose/fences. */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  let text = raw.trim();
  // Strip ```json ... ``` fences.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // Try direct parse first.
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  // Find the outermost balanced {...} block.
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1));
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
          }
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => asString(x))
      .filter((x): x is string => Boolean(x))
      .slice(0, 30);
  }
  if (typeof v === "string") return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 30);
  return [];
}

function asEntityArray(v: unknown): Entity[] {
  if (!Array.isArray(v)) return [];
  const out: Entity[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const value = asString(obj.value);
    if (!value) continue;
    const metadata: Record<string, string> = {};
    if (obj.metadata && typeof obj.metadata === "object") {
      for (const [k, val] of Object.entries(obj.metadata as Record<string, unknown>)) {
        const s = asString(val);
        if (s) metadata[k] = s;
      }
    }
    out.push({
      type: asString(obj.type) || "product",
      value: value.slice(0, 160),
      confidence: Math.min(1, Math.max(0, asNumber(obj.confidence) ?? 0.6)),
      metadata: Object.keys(metadata).length ? metadata : undefined,
    });
  }
  return out.slice(0, 40);
}

/**
 * Validate + coerce a raw model response into a typed DropAnalysis.
 * Never throws on bad fields — defaults are applied.
 */
export function normalizeAnalysis(raw: Record<string, unknown>): DropAnalysis {
  const category = asString(raw.category) ?? "Other";
  const keywords = asStringArray(raw.keywords);
  const confidence = Math.min(1, Math.max(0, asNumber(raw.confidence) ?? 0.7));
  const text = raw.text ?? raw.ocrText ?? raw["OCR text"];

  return {
    title: (asString(raw.title) ?? "Untitled").slice(0, 120),
    summary: (asString(raw.summary) ?? "").slice(0, 600),
    category: isCategory(category) ? category : "Other",
    subcategory: asString(raw.subcategory),
    keywords,
    entities: asEntityArray(raw.entities),
    language: asString(raw.language),
    sentiment: asString(raw.sentiment),
    sourcePlatform: asString(raw.sourcePlatform ?? raw.source),
    intent: asString(raw.intent),
    confidence,
    product: raw.product && typeof raw.product === "object"
      ? (raw.product as DropAnalysis["product"])
      : undefined,
    place: raw.place && typeof raw.place === "object"
      ? (raw.place as DropAnalysis["place"])
      : undefined,
    event: raw.event && typeof raw.event === "object"
      ? (raw.event as DropAnalysis["event"])
      : undefined,
    receipt: raw.receipt && typeof raw.receipt === "object"
      ? (raw.receipt as DropAnalysis["receipt"])
      : undefined,
    reservation: raw.reservation && typeof raw.reservation === "object"
      ? (raw.reservation as DropAnalysis["reservation"])
      : undefined,
    flight: raw.flight && typeof raw.flight === "object"
      ? (raw.flight as DropAnalysis["flight"])
      : undefined,
    ocrText: asString(text),
    suggestedAction: asString(raw.suggestedAction),
    suggestedReminder:
      raw.suggestedReminder && typeof raw.suggestedReminder === "object"
        ? {
            text: (asString((raw.suggestedReminder as Record<string, unknown>).text) ?? "Remind me").slice(0, 140),
            at: asNumber((raw.suggestedReminder as Record<string, unknown>).at),
          }
        : undefined,
  };
}
