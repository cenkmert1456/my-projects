"use node";

// AI analysis pipeline. Runs as a scheduled action right after a Drop is
// created, so the user sees their Drop instantly while DROP "understands" it
// in the background.
//
// Pipeline:  original content → AIProvider.analyze → structured understanding
//          → AIProvider.embed → semantic vector (stored on the Drop)
//
// Providers never fail the Drop: if analysis fails the Drop is kept, marked
// "failed", and can be retried from the UI.

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ANALYSIS_VERSION } from "./lib/constants";
import { buildSearchText } from "./lib/drops_helpers";
import { getProvider } from "./ai";
import type { AnalyzeInput } from "./ai/types";

export const analyzeDrop = internalAction({
  args: { dropId: v.id("drops") },
  handler: async (ctx, { dropId }) => {
    const drop = await ctx.runQuery(internal.internal_ops.getDropById, { dropId });
    if (!drop) return;

    // Cache: never re-analyze unchanged content.
    if (drop.analysisStatus === "done" && drop.analysisVersion === ANALYSIS_VERSION) {
      return;
    }

    await ctx.runMutation(internal.internal_ops.patchDropAnalysisState, {
      dropId,
      status: "processing",
      analysisStatus: "processing",
    });

    try {
      // Build the provider input.
      const input: AnalyzeInput = {
        kind: drop.kind,
        title: drop.title,
        text: drop.text ?? undefined,
        url: drop.url ?? undefined,
        fileName: drop.fileName ?? undefined,
        contentType: drop.contentType ?? undefined,
      };
      if (drop.storageId) {
        const url = await ctx.storage.getUrl(drop.storageId);
        if (url) input.fileUrl = url;
      }

      const provider = getProvider();
      const analysis = await provider.analyze(input);

      const searchText = buildSearchText({
        title: analysis.title,
        summary: analysis.summary,
        keywords: analysis.keywords,
        tags: drop.tags,
        text: drop.text,
        ocrText: analysis.ocrText,
        category: analysis.category,
        subcategory: analysis.subcategory,
        url: drop.url,
        source: analysis.sourcePlatform ?? drop.source,
        entities: analysis.entities,
      });

      let embedding: number[] | undefined;
      try {
        embedding = await provider.embed(searchText);
      } catch (e) {
        // Semantic search unavailable — keyword search still works.
        console.warn("Embedding failed, skipping semantic index:", e);
      }

      await ctx.runMutation(internal.internal_ops.patchDropAnalysisResult, {
        dropId,
        result: {
          title: analysis.title,
          summary: analysis.summary,
          category: analysis.category,
          subcategory: analysis.subcategory,
          keywords: analysis.keywords,
          entities: analysis.entities,
          language: analysis.language,
          sentiment: analysis.sentiment,
          intent: analysis.intent,
          confidence: analysis.confidence,
          product: analysis.product,
          place: analysis.place,
          event: analysis.event,
          receipt: analysis.receipt,
          reservation: analysis.reservation,
          flight: analysis.flight,
          ocrText: analysis.ocrText,
          suggestedAction: analysis.suggestedAction,
          suggestedReminder: analysis.suggestedReminder,
          source: analysis.sourcePlatform ?? drop.source,
          searchText,
          embedding,
          embeddingProvider: embedding ? provider.id : undefined,
          analysisVersion: ANALYSIS_VERSION,
          status: analysis.confidence < 0.45 ? "needs_review" : "ready",
          analysisStatus: "done",
        },
      });
    } catch (error) {
      console.error("Drop analysis failed:", error);
      await ctx.runMutation(internal.internal_ops.patchDropAnalysisState, {
        dropId,
        status: "failed",
        analysisStatus: "failed",
      });
    }
  },
});
