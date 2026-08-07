// GeminiProvider — multimodal analysis + embeddings via the Google AI
// (Gemini) REST API. Chosen for DROP because a single API key covers:
//   - vision/OCR on screenshots and images (gemini-2.x-flash)
//   - long-context text + PDF/document understanding
//   - cheap text embeddings (text-embedding-004)
//   - a generous free tier for consumer-scale usage
//
// Required env var (set in the project's Keys/API keys UI):
//   GOOGLE_API_KEY
// Optional tuning:
//   GEMINI_MODEL            (default "gemini-2.5-flash")
//   GEMINI_EMBEDDING_MODEL  (default "text-embedding-004")

import type { AIProvider, AnalyzeInput, DropAnalysis, SourceItem } from "./types";
import { extractJsonObject, normalizeAnalysis } from "./parse";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiProvider implements AIProvider {
  id = "gemini";

  private key: string;
  private model: string;
  private embeddingModel: string;

  constructor(key: string) {
    this.key = key;
    this.model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    this.embeddingModel = process.env.GEMINI_EMBEDDING_MODEL ?? "text-embedding-004";
  }

  private async generateContent(
    parts: Array<Record<string, unknown>>,
    jsonMode = true,
  ): Promise<string> {
    const res = await fetch(
      `${GEMINI_BASE}/models/${this.model}:generateContent?key=${this.key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            ...(jsonMode ? { responseMimeType: "application/json" } : {}),
          },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Fall back to an older flash model if the configured one is unavailable.
      if (res.status === 404 && this.model !== "gemini-2.0-flash") {
        this.model = "gemini-2.0-flash";
        return this.generateContent(parts, jsonMode);
      }
      throw new Error(`Gemini API ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) throw new Error("Gemini returned an empty response");
    return text;
  }

  async analyze(input: AnalyzeInput): Promise<DropAnalysis> {
    const parts: Array<Record<string, unknown>> = [
      {
        text: `You are the analysis engine inside DROP, a personal memory app. Analyze the user's saved content and return ONLY valid JSON matching this schema:

{
  "title": "short, specific, human title (max 10 words, e.g. \"Black Nike Air Max – €129\")",
  "summary": "1-2 sentence neutral summary of what this is",
  "category": "one of: Products, Places, Travel, Food, Entertainment, Documents, Receipts, Events, Ideas, Work, Study, People, Shopping, Reservations, Tickets, Finance, Inspiration, Other",
  "subcategory": "short subtype, e.g. Shoes, Hotels, Flights, Restaurants, TV Shows, Books, Concerts, Utilities",
  "keywords": ["4-10 search keywords"],
  "language": "ISO code",
  "sentiment": "one of positive, neutral, negative, mixed (only when clearly evident)",
  "sourcePlatform": "instagram, tiktok, youtube, x, pinterest, web, app or unknown",
  "intent": "e.g. buy_later, visit_later, watch_later, read_later, remember, action_required",
  "confidence": 0.0-1.0 (how sure you are overall; 0.5 means genuinely uncertain)",
  "entities": [{"type": "person|brand|place|address|date|time|price|currency|product|event|url|phone|email|number|reservation|genre|organization|language|color|size", "value": "extracted value", "confidence": 0-1, "metadata": {optional key-value context}}],
  "product": {"name": "", "brand": "", "price": <number>, "currency": "", "store": "", "productUrl": "", "category": "", "variant": "", "color": "", "size": ""},
  "place": {"name": "", "city": "", "country": "", "address": "", "category": "Restaurant|Hotel|Shop|Attraction|Other", "source": "", "lat": <number>, "lng": <number>},
  "event": {"name": "", "startTime": <unix ms or null>, "endTime": <unix ms or null>, "location": "", "url": ""},
  "receipt": {"merchant": "", "purchaseDate": <unix ms or null>, "items": ["..."], "total": <number>, "currency": "", "paymentMethod": "", "orderNumber": "", "returnDeadline": <unix ms or null>, "warrantyUntil": <unix ms or null>},
  "reservation": {"type": "flight|hotel|restaurant|event|other", "reference": "", "provider": "", "startTime": <unix ms or null>, "endTime": <unix ms or null>, "location": "", "details": ""},
  "flight": {"airline": "", "flightNumber": "", "departure": "", "destination": "", "departureTime": <unix ms or null>, "arrivalTime": <unix ms or null>, "bookingReference": ""},
  "ocrText": "full visible text from the image, verbatim",
  "suggestedAction": "one short helpful action, e.g. Track price, Open in Maps, Add to calendar, Remind me, Add to Watchlist, or omit",
  "suggestedReminder": {"text": "short natural reminder suggestion", "at": <unix ms or null>}
}

RULES:
- Never fabricate facts. If unsure, omit fields or lower confidence below 0.6.
- Prices: numeric value in "price", currency code in "currency".
- If nothing is identifiable, still give a neutral title, category Other, confidence < 0.5.
- Use the CURRENT date for relative dates.`,
      },
    ];

    // Attach the file when present (image / screenshot / document).
    if (input.fileUrl) {
      try {
        const fileRes = await fetch(input.fileUrl);
        if (fileRes.ok) {
          const buf = Buffer.from(await fileRes.arrayBuffer());
          const mime = input.contentType || fileRes.headers.get("content-type") || "image/jpeg";
          if (buf.byteLength > 0 && buf.byteLength <= 20 * 1024 * 1024) {
            parts.push({
              inlineData: { mimeType: mime, data: buf.toString("base64") },
            });
          }
        }
      } catch {
        // Proceed without the file rather than failing the whole drop.
      }
    }

    const context: string[] = [`Kind: ${input.kind}`];
    if (input.title) context.push(`Provided title: ${input.title}`);
    if (input.text) context.push(`Text content:\n${input.text.slice(0, 6000)}`);
    if (input.url) context.push(`URL: ${input.url}`);
    if (input.fileName) context.push(`File name: ${input.fileName}`);
    parts.push({ text: context.join("\n\n") });

    const raw = await this.generateContent(parts);
    const obj = extractJsonObject(raw);
    if (!obj) {
      // If JSON mode failed, fall back to a minimal analysis.
      throw new Error("Could not parse Gemini analysis JSON");
    }
    return normalizeAnalysis(obj);
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(
      `${GEMINI_BASE}/models/${this.embeddingModel}:embedContent?key=${this.key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { parts: [{ text: text.slice(0, 8000) }] } }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini embeddings ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      embedding?: { values?: number[] };
    };
    const values = data.embedding?.values;
    if (!values) throw new Error("Gemini embeddings: empty response");
    return values;
  }

  /** Answer a question strictly from the user's own Drops. */
  async synthesize(question: string, sources: SourceItem[]): Promise<string | null> {
    if (!sources.length) return null;
    const list = sources
      .map((s, i) => {
        const when = s.savedAt ? new Date(s.savedAt).toLocaleDateString() : "unknown date";
        return `${i + 1}. "${s.title}" (${s.category ?? "Uncategorized"}, saved ${when})${s.facts ? ` — ${s.facts}` : ""}${s.summary ? ` Summary: ${s.summary}` : ""}`;
      })
      .join("\n");
    const parts = [
      {
        text: `You are the memory assistant inside DROP, a personal memory app. Answer the user's question using ONLY the saved items listed below. These are the user's own saved Drops — never invent or imply items that are not in the list.

SAVED DROPS:\n${list}

RULES:
- Base your answer exclusively on these items.
- If the question asks for a recommendation between items (e.g. hotels), compare the items that actually exist in the list.
- Keep the answer concise (under 160 words), natural, and concrete (names, prices, dates from the items).
- If nothing in the list is relevant, say so honestly.
- Note anything that came from the user's Drops with phrases like "of the places you saved".`,
      },
      { text: `Question: ${question}` },
    ];
    const raw = await this.generateContent(parts, false);
    return raw.trim().slice(0, 2000);
  }
}
