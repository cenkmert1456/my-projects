import type { PluginListenerHandle } from "@capacitor/core";

/**
 * DROP Intelligence — on-device AI engine.
 *
 * Internal capability tiers (never shown to users):
 *   system — Apple Foundation Models / Gemini Nano available
 *   local  — bundled downloadable open-weight model (Gemma-class) runs locally
 *   light  — strong device: lightweight pipeline (OCR + embeddings + rules)
 *   basic  — very limited device: OCR + metadata + full-text search
 *   web    — browser: server-side pipeline handles intelligence
 */
export type DropAITier = "system" | "local" | "light" | "basic" | "web";

export type DropAIStatus =
  | { phase: "idle"; tier: null }
  | { phase: "detecting"; tier: null }
  | { phase: "downloading"; tier: DropAITier | null; progress: number; label: string }
  | { phase: "ready"; tier: DropAITier; onDevice: boolean }
  | { phase: "error"; tier: DropAITier | null; message: string };

export interface DropAIPolicy {
  /** Only download the model over Wi-Fi (default true). */
  wifiOnly: boolean;
}

export interface DropAIAnalysis {
  title?: string;
  summary?: string;
  category?: string;
  subcategory?: string;
  keywords?: string[];
  tags?: string[];
  visualDescription?: string;
  ocrSummary?: string;
  products?: string[];
  brands?: string[];
  places?: string[];
  peopleMentioned?: string[];
  dates?: string[];
  prices?: string[];
  currency?: string;
  events?: string[];
  actions?: string[];
  confidence?: number;
  language?: string;
}

export interface DropAI {
  /**
   * Detect device capabilities and provision the right engine automatically.
   * May show a one-time download on devices without system AI.
   */
  prepare(): Promise<{ ok: boolean }>;
  /** Current engine status (phase + tier + progress). */
  getStatus(): Promise<{ status: DropAIStatus }>;
  /** On-device multilingual text embedding (same algorithm as server). */
  getEmbedding(options: { text: string }): Promise<{ embedding: number[] }>;
  /** Native OCR (ML Kit on Android, Apple Vision on iOS). Works offline. */
  ocr(options: { image: string }): Promise<{ text: string; language?: string } | null>;
  /** Structured multimodal analysis of an image. */
  analyzeImage(options: { image: string }): Promise<{ analysis: DropAIAnalysis | null }>;
  /** Free-form text generation (system/local model only; null otherwise). */
  generateText(options: { prompt: string; context?: string }): Promise<{ text: string | null }>;
  /** Grounded question answering over provided context. */
  answerQuestion(options: { question: string; context: string }): Promise<{ answer: string | null }>;
  /** Download policy (Wi-Fi only, …). */
  setPolicy(options: DropAIPolicy): Promise<{ ok: boolean }>;
  getPolicy(): Promise<DropAIPolicy>;
  /** Remove the downloaded model (keeps the app fully functional). */
  removeModel(): Promise<{ ok: boolean }>;
  /** On-device model storage usage. */
  getStorageInfo(): Promise<{ sizeBytes?: number } | null>;
  addListener(
    eventName: "status",
    listener: (data: { status: DropAIStatus }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "downloadProgress",
    listener: (data: { progress: number; label: string }) => void,
  ): Promise<PluginListenerHandle>;
}
