/**
 * enrichDropAfterSave — SAVE FIRST, ENRICH SECOND.
 *
 * The Drop is ALREADY persisted by the caller before this runs. This helper
 * only attaches optional on-device intelligence afterwards:
 *
 *   1. OCR   → ocr_text (indexed into search_text via dropService.attachOcr)
 *   2. Vision analysis → title/category/entities (dropService.attachAnalysis)
 *
 * Every failure is swallowed (dev-log only): the Drop must never be lost or
 * blocked because enrichment failed. When the native DropAI engine is
 * unavailable (web, unsupported device, not provisioned), this is a clean
 * no-op — the deterministic analysis already stored at save time still
 * powers categories and keyword search.
 */
import { dropService } from "./drops";
import type { NativeDropAnalysis } from "@/lib/drop-ai";

export interface EnrichInput {
  userId: string;
  dropId: string;
  /** base64 data URL of the captured image (camera / gallery / share). */
  imageDataUrl?: string;
}

export async function enrichDropAfterSave(input: EnrichInput): Promise<void> {
  const { userId, dropId, imageDataUrl } = input;
  if (!dropId) return;

  try {
    const { getDropAI } = await import("@/lib/drop-ai");
    const engine = await getDropAI();
    if (!engine) return;

    let analysis: NativeDropAnalysis | null = null;

    if (imageDataUrl) {
      // 1. OCR — text becomes searchable (ocr_text feeds search_text).
      const ocr = await engine.ocr(imageDataUrl);
      if (ocr?.text?.trim()) {
        await dropService.attachOcr(userId, dropId, {
          text: ocr.text,
          language: ocr.language,
          engine: "drop-ai",
        });
      }
      // 2. Vision analysis — title, category, entities, suggested action.
      try {
        analysis = await engine.analyzeImage(imageDataUrl);
      } catch {
        analysis = null;
      }
    }

    if (analysis) {
      await dropService.attachAnalysis(userId, dropId, analysis);
    }
  } catch (err) {
    // The save already succeeded — enrichment is optional. Never surface
    // raw errors to the user and never throw out of this helper.
    if (import.meta.env.DEV) {
      console.warn("[DROP enrich] enrichment skipped for", dropId, err);
    }
  }
}
