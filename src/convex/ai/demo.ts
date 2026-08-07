// DemoProvider — a deterministic, zero-cost analyzer used whenever no AI API
// key is configured. It performs lightweight keyword/entity detection so the
// product's SAVE → UNDERSTAND → SEARCH loop works out of the box (and in
// demos) without spending money. Swap in a real provider by adding an API key
// (see src/convex/ai/index.ts).
//
// The quality here is intentionally lower than a real multimodal model: it
// only reads text + file names + URLs, not image pixels.

import type { AnalyzeInput, AIProvider, DropAnalysis, Entity } from "./types";

const BRAND_RE = /\b(nike|adidas|apple|sony|samsung|lg|lenovo|dell|hp|asus|media ?markt|ikea|zara|h&m|amazon|spotify|netflix|prime video|disney\+|airbnb|booking|turkish airlines|ryanair|lufthansa|enel|vodafone|tre)\b/i;

const CITY_MAP: Record<string, { country?: string }> = {
  rome: { country: "Italy" },
  roma: { country: "Italy" },
  milan: { country: "Italy" },
  milano: { country: "Italy" },
  paris: { country: "France" },
  berlin: { country: "Germany" },
  london: { country: "United Kingdom" },
  tokyo: { country: "Japan" },
  kyoto: { country: "Japan" },
  osaka: { country: "Japan" },
  istanbul: { country: "Türkiye" },
  barcelona: { country: "Spain" },
  madrid: { country: "Spain" },
  lisbon: { country: "Portugal" },
  amsterdam: { country: "Netherlands" },
  athens: { country: "Greece" },
};

const PLACE_WORDS = /\b(hotel|restaurant|trattoria|pizzeria|café|cafe|bar|hostel|museum|airbnb|booking|ristorante)\b/i;
const FLIGHT_WORDS = /\b(flight|airline|boarding|departure|terminal|gate|ticket no|booking ref|pnr|e-ticket)\b/i;
const RECEIPT_WORDS = /\b(receipt|bill|invoice|order no|total|payment|refund|warranty|due)\b/i;
const EVENT_WORDS = /\b(ticket|concert|festival|show|match|gig|event|reservation|booked)\b/i;
const ENTERTAINMENT_WORDS = /\b(series|netflix|film|movie|show|episode|season|documentary|album|podcast)\b/i;
const BOOK_WORDS = /\b(book|read|goodreads|author|novel|reading)\b/i;
const IDEA_WORDS = /\b(idea|inspiration|moodboard|concept|wish|plan|apartment|decor|interior)\b/i;

const CURRENCY_RE = /(€|€|£|\$|¥|₺|\bEUR\b|\bUSD\b|\bGBP\b|\bJPY\b|\bTRY\b)/;
const PRICE_RE = /([€£$¥₺])\s?(\d{1,3}(?:[.,]\d{2,3})*)/;

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const DATE_RE = new RegExp(
  `\\b(${MONTHS.join("|")})\\b(?:\\s+(\\d{1,2}))?[.,]?\\s*(\\d{4})?`,
  "i",
);

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function sourceFromUrl(url: string): string | undefined {
  const host = hostOf(url);
  if (/instagram/.test(host)) return "instagram";
  if (/tiktok/.test(host)) return "tiktok";
  if (/youtu/.test(host)) return "youtube";
  if (/twitter|x\.com/.test(host)) return "x";
  if (/pinterest/.test(host)) return "pinterest";
  if (/reddit/.test(host)) return "web";
  if (host) return "web";
  return undefined;
}

function detectEntities(input: AnalyzeInput): Entity[] {
  const haystack = `${input.title ?? ""} ${input.text ?? ""} ${input.url ?? ""} ${input.fileName ?? ""}`;
  const entities: Entity[] = [];
  const push = (type: string, value: string, confidence: number, metadata?: Record<string, string>) =>
    entities.push({ type, value: value.slice(0, 120), confidence, metadata });

  const brand = haystack.match(BRAND_RE);
  if (brand) push("brand", brand[1], 0.8);

  const price = haystack.match(PRICE_RE);
  if (price) push("price", `${price[1]}${price[2]}`, 0.75);

  const currency = haystack.match(CURRENCY_RE);
  if (currency) push("currency", currency[1] === "€" ? "EUR" : currency[1], 0.7);

  const date = haystack.match(DATE_RE);
  if (date) {
    const month = date[1][0].toUpperCase() + date[1].slice(1);
    push("date", `${month}${date[2] ? " " + date[2] : ""}${date[3] ? ", " + date[3] : ""}`, 0.7);
  }

  for (const [city, meta] of Object.entries(CITY_MAP)) {
    if (new RegExp(`\\b${city}\\b`, "i").test(haystack)) {
      push("place", city[0].toUpperCase() + city.slice(1), 0.8, meta.country ? { country: meta.country } : undefined);
    }
  }

  const urlMatch = input.url ? [input.url] : haystack.match(/https?:\/\/[^\s]+/g) ?? [];
  if (urlMatch.length) push("url", urlMatch[0], 0.9);

  if (input.kind === "image" || input.kind === "screenshot") {
    const name = input.fileName ?? input.title ?? "";
    const clean = name.replace(/\.(png|jpe?g|webp|gif|heic)$/i, "").replace(/[_-]+/g, " ");
    if (clean && !/^(img_|image|screenshot|photo|whatsapp|signal)[\s\d_]*$/i.test(clean)) {
      push("product", titleCase(clean), 0.55);
    }
  }
  return entities;
}

function guessCategory(input: AnalyzeInput, text: string): { category: string; subcategory?: string } {
  if (FLIGHT_WORDS.test(text) || /\bflight\b|\bairline\b/i.test(text)) return { category: "Travel", subcategory: "Flights" };
  if (RECEIPT_WORDS.test(text) && /\b(receipt|bill|invoice|due|total)\b/i.test(text)) return { category: "Receipts", subcategory: "Utilities" };
  if (EVENT_WORDS.test(text) || /\b(concert|festival|ticket)\b/i.test(text)) return { category: "Events", subcategory: "Concerts" };
  if (BOOK_WORDS.test(text)) return { category: "Entertainment", subcategory: "Books" };
  if (ENTERTAINMENT_WORDS.test(text)) return { category: "Entertainment", subcategory: "TV Shows" };
  if (PLACE_WORDS.test(text)) {
    if (/hotel|hostel|airbnb|booking/i.test(text)) return { category: "Places", subcategory: "Hotels" };
    return { category: "Places", subcategory: "Restaurants" };
  }
  if (IDEA_WORDS.test(text)) return { category: "Ideas", subcategory: "Home" };
  if (/\b(price|€|£|\$|¥|₺|deal|offer|discount|shop|store)\b/i.test(text)) return { category: "Products", subcategory: "Shopping" };
  if (input.kind === "document") return { category: "Documents", subcategory: "PDF" };
  if (input.kind === "link") return { category: "Inspiration", subcategory: "Web" };
  return { category: "Other" };
}

function suggestAction(category: string, input: AnalyzeInput): string | undefined {
  switch (category) {
    case "Products":
      return "Track price";
    case "Places":
      return "Open in Maps";
    case "Travel":
      return "Add to calendar";
    case "Events":
      return "Add to calendar";
    case "Tickets":
      return "Add to calendar";
    case "Receipts":
      return "Set reminder";
    case "Entertainment":
      return input.kind === "link" ? "Add to Watchlist" : "Save";
    default:
      return undefined;
  }
}

export function demoEmbedText(text: string): number[] {
  // Deterministic 128-dim bag-of-ngrams embedding. Not a real semantic model,
  // but cosine similarity over character n-grams gives meaningful lexical
  // matching for the demo, and results are stable across requests.
  const dim = 128;
  const vec = new Array<number>(dim).fill(0);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s€$£¥]/g, " ");
  const clean = norm(text);
  const tokens = clean.split(/\s+/).filter(Boolean);
  const add = (key: string) => {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    vec[Math.abs(h) % dim] += 1;
  };
  for (const t of tokens) {
    add(t);
    if (t.length > 2) add("2:" + t.slice(0, 2));
    if (t.length > 3) add("3:" + t.slice(0, 3));
  }
  let mag = 0;
  for (const v of vec) mag += v * v;
  mag = Math.sqrt(mag) || 1;
  return vec.map((v) => v / mag);
}

export class DemoProvider implements AIProvider {
  id = "demo";

  async analyze(input: AnalyzeInput): Promise<DropAnalysis> {
    const text = [input.text, input.title, input.fileName, input.url]
      .filter(Boolean)
      .join(" ");
    const entities = detectEntities(input);
    const { category, subcategory } = guessCategory(input, text);

    let title = "Untitled";
    if (input.kind === "note" && input.text) {
      title = input.text.split(/\n|\./)[0].slice(0, 60) || "Note";
    } else if (input.kind === "link" && input.url) {
      title = titleCase(hostOf(input.url)) + " – " + (input.title ? input.title.slice(0, 40) : "saved link");
    } else if (input.fileName) {
      title = titleCase(input.fileName.replace(/\.(png|jpe?g|webp|gif|heic|pdf|docx?|txt)$/i, ""));
    } else if (input.title) {
      title = input.title.slice(0, 60);
    }

    const keywords = [
      ...new Set(
        [...text.toLowerCase().matchAll(/[a-zà-ÿ0-9]{3,}/g)]
          .map((m) => m[0])
          .filter((w) => !["the", "and", "for", "with", "from", "this", "that", "https"].includes(w))
          .slice(0, 12),
      ),
    ];

    return {
      title,
      summary: input.text ? input.text.slice(0, 300) : `Saved ${input.kind}${input.fileName ? ` (${input.fileName})` : ""}.`,
      category,
      subcategory,
      keywords,
      entities,
      language: "en",
      sourcePlatform: input.url ? sourceFromUrl(input.url) : input.kind === "screenshot" ? "app" : undefined,
      confidence: 0.6,
      suggestedAction: suggestAction(category, input),
      suggestedReminder: category === "Travel" ? { text: "Remind me before this trip" } : undefined,
    };
  }

  async embed(text: string): Promise<number[]> {
    return demoEmbedText(text);
  }
}
