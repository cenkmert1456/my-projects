// AI provider abstraction for DROP.
//
// DROP never calls an AI provider directly from the rest of the codebase.
// Everything goes through the `AIProvider` interface below, so providers can
// be swapped (Gemini today; OpenAI, Anthropic, local models, etc. later)
// without touching the pipeline in src/convex/analyze.ts.
//
// - `analyze` turns raw drop content (image URL, text, URL, document) into
//   structured understanding: title, summary, category, entities, product /
//   place / event / receipt / reservation details, suggested actions.
// - `embed` turns text into a vector for semantic search.
//
// When no API key is configured the pipeline falls back to `DemoProvider`,
// a deterministic heuristic analyzer, so the product is fully usable (and
// demoable) before a key is added.

import type { DropKind } from "../lib/constants";

export interface Entity {
  type: string;
  value: string;
  confidence: number;
  metadata?: Record<string, string>;
}

export interface ProductInfo {
  name?: string;
  brand?: string;
  price?: number;
  currency?: string;
  store?: string;
  productUrl?: string;
  category?: string;
  variant?: string;
  color?: string;
  size?: string;
}

export interface PlaceInfo {
  name?: string;
  city?: string;
  country?: string;
  address?: string;
  category?: string;
  source?: string;
  lat?: number;
  lng?: number;
}

export interface EventInfo {
  name?: string;
  startTime?: number;
  endTime?: number;
  location?: string;
  url?: string;
}

export interface ReceiptInfo {
  merchant?: string;
  purchaseDate?: number;
  items?: string[];
  total?: number;
  currency?: string;
  paymentMethod?: string;
  orderNumber?: string;
  returnDeadline?: number;
  warrantyUntil?: number;
}

export interface ReservationInfo {
  type?: string;
  reference?: string;
  provider?: string;
  startTime?: number;
  endTime?: number;
  location?: string;
  details?: string;
}

export interface FlightInfo {
  airline?: string;
  flightNumber?: string;
  departure?: string;
  destination?: string;
  departureTime?: number;
  arrivalTime?: number;
  bookingReference?: string;
}

export interface SuggestedReminder {
  text: string;
  at?: number;
}

export interface DropAnalysis {
  title: string;
  summary: string;
  category: string;
  subcategory?: string;
  keywords: string[];
  entities: Entity[];
  language?: string;
  sentiment?: string;
  sourcePlatform?: string;
  intent?: string;
  confidence: number;
  product?: ProductInfo;
  place?: PlaceInfo;
  event?: EventInfo;
  receipt?: ReceiptInfo;
  reservation?: ReservationInfo;
  flight?: FlightInfo;
  ocrText?: string;
  suggestedAction?: string;
  suggestedReminder?: SuggestedReminder;
}

export interface AnalyzeInput {
  kind: DropKind;
  title?: string;
  text?: string;
  url?: string;
  fileName?: string;
  contentType?: string;
  /** Signed/private URL to the original file (image / document). */
  fileUrl?: string;
}

/** A single source item passed to `synthesize` (a retrieved Drop). */
export interface SourceItem {
  id: string;
  title: string;
  summary?: string;
  category?: string;
  savedAt?: number;
  facts?: string;
}

export interface AIProvider {
  id: string;
  analyze(input: AnalyzeInput): Promise<DropAnalysis>;
  embed(text: string): Promise<number[]>;
  /**
   * Answer a natural-language question strictly from the user's own Drops
   * (`sources`). Returns null when the provider can't synthesize (e.g. demo
   * mode) — the caller then falls back to structured results.
   */
  synthesize?(question: string, sources: SourceItem[]): Promise<string | null>;
}
