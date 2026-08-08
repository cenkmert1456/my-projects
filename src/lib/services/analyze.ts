/**
 * Deterministic analyzer — port of the old backend DemoProvider so the web
 * keeps its zero-config "save → understand" loop with no server action and no
 * API keys. Native devices use the DropAI engine instead and store their
 * results via attachOcr / attachEmbedding / attachAnalysis.
 */

import { dropEmbedText } from "@/lib/embed";
import type { DropEntity, DropKind } from "@/lib/supabase/database.types";

const BRAND_RE = /\b(nike|adidas|apple|sony|samsung|lg|lenovo|dell|hp|asus|media ?markt|ikea|zara|h&m|amazon|spotify|netflix|prime video|disney\+|airbnb|booking|turkish airlines|ryanair|lufthansa|enel|vodafone|tre)\b/i;
const CITY_MAP: Record<string, string> = {
  rome: "Italy", roma: "Italy", milan: "Italy", milano: "Italy",
  paris: "France", berlin: "Germany", london: "United Kingdom",
  tokyo: "Japan", kyoto: "Japan", osaka: "Japan", istanbul: "Türkiye",
  barcelona: "Spain", madrid: "Spain", lisbon: "Portugal",
  amsterdam: "Netherlands", athens: "Greece",
};
const PLACE_WORDS = /\b(hotel|restaurant|trattoria|pizzeria|café|cafe|bar|hostel|museum|airbnb|booking|ristorante)\b/i;
const FLIGHT_WORDS = /\b(flight|airline|boarding|departure|terminal|gate|ticket no|booking ref|pnr|e-ticket)\b/i;
const RECEIPT_WORDS = /\b(receipt|bill|invoice|order no|total|payment|refund|warranty|due)\b/i;
const EVENT_WORDS = /\b(ticket|concert|festival|show|match|gig|event|reservation|booked)\b/i;
const ENTERTAINMENT_WORDS = /\b(series|netflix|film|movie|show|episode|season|documentary|album|podcast)\b/i;
const BOOK_WORDS = /\b(book|read|goodreads|author|novel|reading)\b/i;
const IDEA_WORDS = /\b(idea|inspiration|moodboard|concept|wish|plan|apartment|decor|interior)\b/i;
const PRICE_RE = /([€£$¥₺])\s?(\d{1,3}(?:[.,]\d{2,3})*)/;
const URL_RE = /https?:\/\/\S+/i;
const DATE_RE = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b(?:\s+\d{1,2})?[.,]?\s*\d{4}?/i;

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "https", "http",
]);

export interface DeterministicResult {
  title: string;
  summary: string;
  category: string;
  subcategory?: string;
  keywords: string[];
  entities: DropEntity[];
  confidence: number;
  language?: string;
  suggestedAction?: string;
  embedding: number[];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function sourceFromUrl(url: string): string | undefined {
  const host = hostOf(url);
  if (/instagram/.test(host)) return "instagram";
  if (/tiktok/.test(host)) return "tiktok";
  if (/youtu/.test(host)) return "youtube";
  if (/twitter|x\.com/.test(host)) return "x";
  if (/pinterest/.test(host)) return "pinterest";
  if (host) return "web";
  return undefined;
}

export function analyzeText(input: {
  kind: DropKind;
  text?: string;
  title?: string;
  url?: string;
  fileName?: string;
  ocrText?: string;
}): DeterministicResult {
  const text = [input.text, input.ocrText, input.title, input.fileName, input.url]
    .filter(Boolean)
    .join(" ");

  const entities: DropEntity[] = [];
  const push = (type: string, value: string, confidence: number) => {
    entities.push({ type, value: value.slice(0, 120), confidence });
  };
  const brand = BRAND_RE.exec(text);
  if (brand) push("brand", brand[0], 0.8);
  const price = PRICE_RE.exec(text);
  if (price) push("price", price[0], 0.75);
  const date = DATE_RE.exec(text);
  if (date) push("date", date[0], 0.7);
  const url = URL_RE.exec(text);
  if (url) push("url", url[0], 0.9);
  for (const city of Object.keys(CITY_MAP)) {
    if (new RegExp(`\\b${city}\\b`, "i").test(text)) {
      push("place", titleCase(city), 0.85);
      break;
    }
  }

  let category = "Other";
  let subcategory: string | undefined;
  if (FLIGHT_WORDS.test(text)) {
    category = "Travel";
    subcategory = "Flights";
  } else if (RECEIPT_WORDS.test(text)) {
    category = "Receipts";
    subcategory = "Utilities";
  } else if (EVENT_WORDS.test(text)) {
    category = "Events";
    subcategory = "Concerts";
  } else if (BOOK_WORDS.test(text)) {
    category = "Entertainment";
    subcategory = "Books";
  } else if (ENTERTAINMENT_WORDS.test(text)) {
    category = "Entertainment";
    subcategory = "TV Shows";
  } else if (PLACE_WORDS.test(text)) {
    category = "Places";
    subcategory = /hotel|hostel|airbnb|booking/i.test(text) ? "Hotels" : "Restaurants";
  } else if (IDEA_WORDS.test(text)) {
    category = "Ideas";
    subcategory = "Home";
  } else if (PRICE_RE.test(text)) {
    category = "Products";
    subcategory = "Shopping";
  } else if (input.kind === "document") {
    category = "Documents";
    subcategory = "PDF";
  } else if (input.kind === "link") {
    category = "Inspiration";
    subcategory = "Web";
  }

  let title = "Untitled";
  if (input.kind === "note" && input.text) {
    title = input.text.split(/\n|\./)[0].slice(0, 60) || "Note";
  } else if (input.kind === "link" && input.url) {
    title = `${titleCase(hostOf(input.url))}${input.title ? " – " + input.title.slice(0, 40) : ""}`;
  } else if (input.fileName) {
    title = titleCase(input.fileName.replace(/\.(png|jpe?g|webp|gif|heic|pdf|docx?|txt)$/i, ""));
  } else if (input.title) {
    title = input.title.slice(0, 60);
  }
  if (title === "Untitled") title = "New drop";

  const keywords = [
    ...new Set(
      [...text.toLowerCase().matchAll(/[a-zà-ÿ0-9]{3,}/g)]
        .map((m) => m[0])
        .filter((w) => !STOP_WORDS.has(w))
        .slice(0, 12),
    ),
  ];

  const suggestedAction = (() => {
    switch (category) {
      case "Products":
        return "Track price";
      case "Places":
        return "Open in Maps";
      case "Travel":
      case "Events":
        return "Add to calendar";
      case "Receipts":
        return "Set reminder";
      case "Entertainment":
        return input.kind === "link" ? "Add to Watchlist" : undefined;
      default:
        return undefined;
    }
  })();

  return {
    title,
    summary: input.text ? input.text.slice(0, 300) : `Saved ${input.kind}${input.fileName ? ` (${input.fileName})` : ""}.`,
    category,
    subcategory,
    keywords,
    entities: entities.slice(0, 8),
    confidence: 0.6,
    language: "en",
    suggestedAction,
    embedding: dropEmbedText(text),
  };
}
