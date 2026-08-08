// OllamaProvider — free / self-hosted AI for DROP.
//
// Talks to a local Ollama server (default http://localhost:11434) over its
// REST API, so the whole SAVE → UNDERSTAND → SEARCH loop works with open
// weight models and zero paid API costs:
//
//   - analyze:      POST /api/chat  (JSON-mode; vision models get the image)
//   - embed:        POST /api/embed (fallback to legacy /api/embeddings)
//   - synthesize:   POST /api/chat  (grounded answer for Ask DROP)
//   - health:       GET  /api/tags  (model availability + latency)
//
// Model names are configurable via env vars (see .env.example):
//   OLLAMA_BASE_URL          http://localhost:11434
//   OLLAMA_VISION_MODEL      e.g. qwen2.5vl, llama3.2-vision, gemma3
//   OLLAMA_TEXT_MODEL        e.g. qwen2.5, llama3.2, gemma3
//   OLLAMA_EMBEDDING_MODEL   e.g. nomic-embed-text, bge-m3
//
// Nothing is hardcoded to a single model: the server's own model list is
// checked at runtime and the best configured match is used.

import type {
  AIProvider,
  AnalyzeInput,
  DropAnalysis,
  Entity,
  SourceItem,
} from "./types";
import { extractJsonObject } from "./parse";

const DEFAULT_BASE = "http://localhost:11434";
const FETCH_TIMEOUT = 45_000;

export interface OllamaConfig {
  baseUrl: string;
  visionModel?: string;
  textModel?: string;
  embeddingModel?: string;
}

export function ollamaConfig(): OllamaConfig {
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, "");
  return {
    baseUrl,
    visionModel: process.env.OLLAMA_VISION_MODEL,
    textModel: process.env.OLLAMA_TEXT_MODEL,
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL,
  };
}

export interface AIHealth {
  ok: boolean;
  provider: string;
  label: string;
  local: boolean;
  models?: { text?: string; vision?: string; embedding?: string };
  latencyMs?: number;
  error?: string;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function isOllamaReachable(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/tags`, {}, 2500);
    return res.ok;
  } catch {
    return false;
  }
}

function pickModel(configured: string | undefined, candidates: string[], tags: string[]): string | undefined {
  if (configured) {
    return tags.some((t) => t === configured || t.startsWith(`${configured}:`)) ? configured : undefined;
  }
  for (const c of candidates) {
    if (tags.some((t) => t === c || t.startsWith(`${c}:`))) return c;
  }
  return undefined;
}

const ANALYSIS_PROMPT = `You are DROP, an AI memory assistant. Analyze the provided content (text, link, file name, and/or image) and return STRICT JSON only — no markdown, no commentary — matching this shape:

{
  "title": "short, meaningful title (max 60 chars, never the file name like IMG_2817.JPG)",
  "summary": "2-3 sentence summary of what this is and why it might matter",
  "category": "one of: Products, Places, Travel, Food, Entertainment, Documents, Receipts, Events, Ideas, Work, Study, People, Shopping, Reservations, Tickets, Finance, Inspiration, Other",
  "subcategory": "optional specific subcategory, e.g. Restaurants, Flights, Sneakers, TV Shows",
  "keywords": ["3-8 short keywords"],
  "language": "ISO 639-1 code, e.g. en, tr, de",
  "sourcePlatform": "instagram | tiktok | youtube | x | pinterest | web | app | email | manual, if known, else null",
  "confidence": 0.0-1.0 overall confidence,
  "intent": "possible future intent, e.g. 'buy later', 'visit', 'watch later', 'track price', or null",
  "entities": [{"type":"brand|product|place|person|organization|date|time|price|currency|event|address|phone|email|url|reservation|number","value":"as found","confidence":0-1,"metadata":{}}],
  "product": {"name","brand","price"(number),"currency","store","productUrl","category","variant","color","size"} or null,
  "place": {"name","city","country","address","category","source","lat","lng"} or null,
  "event": {"name","startTime"(epoch ms),"endTime"(epoch ms),"location","url"} or null,
  "receipt": {"merchant","purchaseDate"(epoch ms),"items":[""],"total"(number),"currency","paymentMethod","orderNumber","returnDeadline"(epoch ms),"warrantyUntil"(epoch ms)} or null,
  "reservation": {"type","reference","provider","startTime"(epoch ms),"endTime"(epoch ms),"location","details"} or null,
  "flight": {"airline","flightNumber","departure","destination","departureTime"(epoch ms),"arrivalTime"(epoch ms),"bookingReference"} or null,
  "suggestedAction": "Add to calendar | Track price | Open in Maps | Set reminder | Add to watchlist | None",
  "suggestedReminder": {"text":"when/what","at"(epoch ms optional)} or null,
  "ocrText": "all visible text if an image is provided, otherwise null"
}

Rules:
- NEVER invent facts. If unsure, set confidence low (0.3-0.5) or omit the field.
- Preserve the original language of the content.
- If the content is a flight, booking, receipt, event ticket or product, extract those structured fields precisely.
- For images: read ALL visible text into ocrText and describe the visual content in the summary.`;

function buildContent(input: AnalyzeInput, imageBase64?: string) {
  const textBits: string[] = [];
  if (input.title) textBits.push(`Title: ${input.title}`);
  if (input.fileName) textBits.push(`File name: ${input.fileName}`);
  if (input.url) textBits.push(`URL: ${input.url}`);
  if (input.text) textBits.push(`Text: ${input.text}`);
  textBits.push(`Kind: ${input.kind}`);
  const text = textBits.join("\n");

  if (imageBase64) {
    return [
      { type: "image", data: imageBase64 },
      { type: "text", text },
    ];
  }
  return text;
}

export class OllamaProvider implements AIProvider {
  id = "ollama";
  private config: OllamaConfig;
  private healthy: boolean | null = null;
  private healthCheckedAt = 0;
  private tags: string[] = [];

  constructor(config: OllamaConfig) {
    this.config = config;
  }

  /** Quick reachability probe, cached for 60s. */
  async ping(): Promise<boolean> {
    const now = Date.now();
    if (this.healthy !== null && now - this.healthCheckedAt < 60_000) return this.healthy;
    const ok = await isOllamaReachable(this.config.baseUrl);
    this.healthy = ok;
    this.healthCheckedAt = now;
    if (ok) {
      try {
        const res = await fetchWithTimeout(`${this.config.baseUrl}/api/tags`, {}, 5000);
        if (res.ok) {
          const body = (await res.json()) as { models?: Array<{ name: string }> };
          this.tags = (body.models ?? []).map((m) => m.name);
        }
      } catch {
        // tags are optional
      }
    }
    return ok;
  }

  async health(): Promise<AIHealth> {
    const started = Date.now();
    try {
      const ok = await this.ping();
      const latencyMs = Date.now() - started;
      if (!ok) {
        return {
          ok: false,
          provider: this.id,
          label: "Ollama not reachable",
          local: true,
          latencyMs,
          error: `No Ollama server at ${this.config.baseUrl}. Start Ollama (ollama serve) or set OLLAMA_BASE_URL.`,
        };
      }
      const text = pickModel(this.config.textModel, ["qwen2.5", "llama3.2", "gemma3", "mistral", "llama3.1"], this.tags);
      const vision = pickModel(this.config.visionModel, ["qwen2.5vl", "llama3.2-vision", "gemma3", "minicpm-v"], this.tags);
      const embedding = pickModel(this.config.embeddingModel, ["nomic-embed-text", "bge-m3", "all-minilm", "mxbai-embed-large"], this.tags);
      return {
        ok: true,
        provider: this.id,
        label: "Ollama · local AI",
        local: true,
        models: {
          text: text ?? this.config.textModel ?? "—",
          vision: vision ?? this.config.visionModel ?? "not installed",
          embedding: embedding ?? this.config.embeddingModel ?? "not installed",
        },
        latencyMs,
      };
    } catch (e) {
      return {
        ok: false,
        provider: this.id,
        label: "Ollama error",
        local: true,
        error: e instanceof Error ? e.message : "Unknown Ollama error",
      };
    }
  }

  private async chat(
    model: string,
    messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>,
    json = false,
  ): Promise<string> {
    const res = await fetchWithTimeout(`${this.config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature: 0.2 },
        ...(json ? { format: "json" } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Ollama ${model} failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    const body = (await res.json()) as { message?: { content?: string }; response?: string };
    return (body.message?.content ?? body.response ?? "").trim();
  }

  async analyze(input: AnalyzeInput): Promise<DropAnalysis> {
    if (!(await this.ping())) {
      // Ollama configured but offline → deterministic fallback so the Drop
      // never gets stuck. The Settings page surfaces the misconfiguration.
      throw new Error(`Ollama is not reachable at ${this.config.baseUrl}`);
    }

    let imageBase64: string | undefined;
    if (input.fileUrl) {
      try {
        const res = await fetchWithTimeout(input.fileUrl, {}, 20_000);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          imageBase64 = Buffer.from(buf).toString("base64");
        }
      } catch {
        // image fetch failed → text-only analysis
      }
    }

    const visionModel = imageBase64
      ? pickModel(this.config.visionModel, ["qwen2.5vl", "llama3.2-vision", "gemma3", "minicpm-v"], this.tags)
      : undefined;
    const textModel = pickModel(this.config.textModel, ["qwen2.5", "llama3.2", "gemma3", "mistral", "llama3.1"], this.tags);
    const model = visionModel ?? textModel;
    if (!model) {
      throw new Error("No Ollama model available. Pull one, e.g. `ollama pull qwen2.5` (see README).");
    }

    // Vision models handle images; text models still get text metadata + OCR
    // extracted from the same image when the vision model is missing.
    const content = buildContent(input, imageBase64 && visionModel ? imageBase64 : undefined);
    let raw: string;
    try {
      raw = await this.chat(
        model,
        [
          { role: "system", content: ANALYSIS_PROMPT },
          { role: "user", content },
        ],
        true,
      );
    } catch (e) {
      if (imageBase64 && !visionModel) throw e;
      // Some text models can't parse "format: json" — retry without it.
      raw = await this.chat(
        model,
        [
          { role: "system", content: ANALYSIS_PROMPT },
          { role: "user", content },
        ],
        false,
      );
    }

    const parsed = extractJsonObject(raw) as Partial<DropAnalysis>;
    if (!parsed || !parsed.title) {
      throw new Error("Ollama returned an unreadable analysis. Check the model name.");
    }
    const fallback = await fallbackShape(input);
    return normalizeAnalysis(parsed, fallback);
  }

  async embed(text: string): Promise<number[]> {
    if (!(await this.ping())) throw new Error("Ollama not reachable");
    const model = pickModel(this.config.embeddingModel, ["nomic-embed-text", "bge-m3", "all-minilm", "mxbai-embed-large"], this.tags);
    if (!model) throw new Error("No Ollama embedding model installed. `ollama pull nomic-embed-text`");
    try {
      const res = await fetchWithTimeout(`${this.config.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: text.slice(0, 8000) }),
      }, 20_000);
      if (!res.ok) throw new Error(`embed failed: ${res.status}`);
      const body = (await res.json()) as { embeddings?: number[][] };
      if (body.embeddings?.[0]) return body.embeddings[0];
      throw new Error("empty embedding");
    } catch (e) {
      // Legacy endpoint fallback (older Ollama versions).
      const res = await fetchWithTimeout(`${this.config.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: text.slice(0, 8000) }),
      }, 20_000);
      if (!res.ok) throw e;
      const body = (await res.json()) as { embedding?: number[] };
      if (body.embedding) return body.embedding;
      throw e;
    }
  }

  async synthesize(question: string, sources: SourceItem[]): Promise<string | null> {
    if (!(await this.ping())) return null;
    const model = pickModel(this.config.textModel, ["qwen2.5", "llama3.2", "gemma3", "mistral", "llama3.1"], this.tags);
    if (!model) return null;

    const context = sources
      .map(
        (s, i) =>
          `${i + 1}. "${s.title}" [${s.category ?? "uncategorized"}]\n   ${s.summary ?? ""}\n   ${s.facts ?? ""}`,
      )
      .join("\n");

    const prompt = `You are DROP, answering ONLY from the user's saved Drops below. Be concise, friendly, and cite the drop numbers (1, 2…). If the answer is not in these Drops, say so plainly — never invent memories.

DROPS:
${context}

QUESTION: ${question}

Return STRICT JSON: {"answer":"your answer"} — no markdown.`;

    try {
      const raw = await this.chat(model, [{ role: "user", content: prompt }], true);
      const parsed = extractJsonObject(raw) as { answer?: string };
      return parsed?.answer ?? null;
    } catch {
      return null;
    }
  }
}

function normalizeAnalysis(parsed: Partial<DropAnalysis>, fallback: DropAnalysis): DropAnalysis {
  return {
    title: parsed.title ?? fallback.title,
    summary: parsed.summary ?? fallback.summary,
    category: parsed.category ?? fallback.category,
    subcategory: parsed.subcategory ?? fallback.subcategory,
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 12) : fallback.keywords,
    entities: Array.isArray(parsed.entities)
      ? (parsed.entities as Entity[]).slice(0, 30)
      : fallback.entities,
    language: parsed.language ?? fallback.language,
    sentiment: parsed.sentiment ?? fallback.sentiment,
    sourcePlatform: parsed.sourcePlatform ?? fallback.sourcePlatform,
    intent: parsed.intent ?? fallback.intent,
    confidence:
      typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1
        ? parsed.confidence
        : fallback.confidence,
    product: parsed.product ?? fallback.product,
    place: parsed.place ?? fallback.place,
    event: parsed.event ?? fallback.event,
    receipt: parsed.receipt ?? fallback.receipt,
    reservation: parsed.reservation ?? fallback.reservation,
    flight: parsed.flight ?? fallback.flight,
    ocrText: parsed.ocrText ?? fallback.ocrText,
    suggestedAction: parsed.suggestedAction ?? fallback.suggestedAction,
    suggestedReminder: parsed.suggestedReminder ?? fallback.suggestedReminder,
  };
}

/** Deterministic fallback so a malformed provider response still yields a useful Drop. */
async function fallbackShape(input: AnalyzeInput): Promise<DropAnalysis> {
  const text = [input.text, input.title, input.fileName, input.url].filter(Boolean).join(" ");
  return {
    title: input.title ?? (input.fileName ? input.fileName.replace(/\.[a-z0-9]+$/i, "") : "Saved " + input.kind),
    summary: text.slice(0, 240) || `Saved ${input.kind}.`,
    category: "Other",
    keywords: [],
    entities: [],
    language: "en",
    confidence: 0.4,
  };
}
