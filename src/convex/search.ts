"use node";

// Hybrid search: DROP combines
//   1. keyword scoring  (titles, summaries, keywords, tags, text, OCR)
//   2. semantic vectors (cosine similarity over embeddings)
//   3. metadata filters (category, kind, source, place, price, dates, tags)
// and ranks everything together, so vague natural-language queries like
// "that weird lamp I liked" still surface the right Drop.
//
// Scale note (MVP): each search scans the user's own Drops and scores them in
// memory. That is fine for a personal memory (hundreds–low thousands of
// Drops). The natural upgrade path is a vector index (e.g. pgvector / Convex
// vector search) — the schema already isolates embeddings for that migration.

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getProvider } from "./ai";
import type { Doc, Id } from "./_generated/dataModel";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with",
  "my", "i", "me", "is", "was", "are", "were", "that", "this", "what",
  "where", "when", "how", "did", "do", "does", "have", "has", "had", "it",
  "its", "from", "by", "at", "as", "be", "been", "about", "find", "show",
  "saved", "save", "drop", "anything", "everything", "one", "two", "can",
  "you", "your", "all", "any", "but", "not", "so", "if", "then", "than",
  "too", "very", "just", "also", "more", "most", "some", "such", "only",
]);

const SEARCH_FILTERS = v.object({
  category: v.optional(v.string()),
  kind: v.optional(v.string()),
  source: v.optional(v.string()),
  place: v.optional(v.string()),
  minPrice: v.optional(v.number()),
  maxPrice: v.optional(v.number()),
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
  collectionId: v.optional(v.id("collections")),
  tag: v.optional(v.string()),
  starred: v.optional(v.boolean()),
  includeArchived: v.optional(v.boolean()),
  limit: v.optional(v.number()),
});

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9€$£¥à-ÿ]+/)
    .filter(Boolean);
}

function keywordScore(drop: Doc<"drops">, tokens: string[]): { score: number; matched: string[] } {
  const fields: Array<[string, number]> = [
    [drop.title ?? "", 4],
    [drop.keywords?.join(" ") ?? "", 3],
    [drop.summary ?? "", 2],
    [drop.tags?.join(" ") ?? "", 2],
    [drop.category ?? "", 1.5],
    [drop.subcategory ?? "", 1.5],
    [drop.text ?? "", 1],
    [drop.ocrText ?? "", 1],
    [drop.searchText ?? "", 0.75],
  ];
  const lower = fields.map(([f]) => f.toLowerCase());
  const entityText = (drop.entities ?? []).map((e) => `${e.value} ${e.type}`.toLowerCase()).join(" ");
  let score = 0;
  const matched: string[] = [];
  for (const tok of tokens) {
    if (STOPWORDS.has(tok)) continue;
    for (let i = 0; i < lower.length; i++) {
      if (lower[i].includes(tok)) {
        score += fields[i][1];
        matched.push(tok);
        break;
      }
    }
    if (entityText.includes(tok)) {
      score += 2;
      matched.push(tok);
    }
  }
  return { score, matched: [...new Set(matched)] };
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let ma = 0;
  let mb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    ma += a[i] * a[i];
    mb += b[i] * b[i];
  }
  if (ma === 0 || mb === 0) return 0;
  return dot / (Math.sqrt(ma) * Math.sqrt(mb));
}

function passesFilters(
  drop: Doc<"drops">,
  f: {
    category?: string;
    kind?: string;
    source?: string;
    place?: string;
    minPrice?: number;
    maxPrice?: number;
    dateFrom?: number;
    dateTo?: number;
    tag?: string;
    starred?: boolean;
  },
): boolean {
  if (f.category && drop.category !== f.category) return false;
  if (f.kind && drop.kind !== f.kind) return false;
  if (f.source && drop.source !== f.source) return false;
  if (f.place) {
    const p = `${drop.place?.name ?? ""} ${drop.place?.city ?? ""} ${drop.place?.country ?? ""}`;
    if (!p.toLowerCase().includes(f.place.toLowerCase())) return false;
  }
  if (f.minPrice !== undefined || f.maxPrice !== undefined) {
    const price = drop.product?.price;
    if (price === undefined) return false;
    if (f.minPrice !== undefined && price < f.minPrice) return false;
    if (f.maxPrice !== undefined && price > f.maxPrice) return false;
  }
  if (f.dateFrom !== undefined && drop.savedAt < f.dateFrom) return false;
  if (f.dateTo !== undefined && drop.savedAt > f.dateTo) return false;
  if (f.tag && !drop.tags?.includes(f.tag)) return false;
  if (f.starred && !drop.starred) return false;
  return true;
}

export interface SearchHit {
  drop: Doc<"drops">;
  score: number;
  matched: string[];
  semantic: boolean;
}

export const searchDrops = action({
  args: { query: v.string(), filters: v.optional(SEARCH_FILTERS) },
  handler: async (ctx, { query, filters }): Promise<{ results: SearchHit[]; count: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject as Id<"users"> | undefined;
    if (!userId) return { results: [], count: 0 };

    const f = filters ?? {};
    const limit = Math.min(f.limit ?? 30, 50);

    let drops = await ctx.runQuery(internal.internal_ops.getDropsByUser, { userId });
    drops = drops.filter((d) => (f.includeArchived ? true : !d.archived));

    // Collection filter.
    if (f.collectionId) {
      const ids = await ctx.runQuery(internal.internal_ops.getCollectionDropIds, {
        collectionId: f.collectionId,
      });
      const idSet = new Set(ids.map((i) => i.toString()));
      drops = drops.filter((d) => idSet.has(d._id.toString()));
    }

    const tokens = tokenize(query);
    const provider = getProvider();
    let queryVec: number[] | null = null;
    if (tokens.length) {
      try {
        queryVec = await provider.embed(query);
      } catch {
        queryVec = null;
      }
    }

    const scored = drops.map((drop) => {
      const { score: kwScore, matched } = keywordScore(drop, tokens);
      const kwNorm = tokens.length ? Math.min(1, kwScore / 14) : 0;
      let sem = 0;
      let hasSem = false;
      if (tokens.length && queryVec && drop.embedding && drop.embeddingProvider === provider.id) {
        sem = cosine(queryVec, drop.embedding);
        hasSem = sem > 0;
      }
      const combined = hasSem ? 0.55 * sem + 0.45 * kwNorm : kwNorm;
      return { drop, score: combined, kwScore, sem, hasSem, matched };
    });

    const filtered = scored.filter((s) => passesFilters(s.drop, f));

    filtered.sort((a, b) => {
      if (tokens.length === 0) return b.drop.savedAt - a.drop.savedAt;
      if (b.score !== a.score) return b.score - a.score;
      return b.drop.savedAt - a.drop.savedAt;
    });

    const top = filtered.slice(0, limit);
    const results = top.map((s) => ({
      drop: s.drop,
      score: Math.round(s.score * 100) / 100,
      matched: s.matched.slice(0, 3),
      semantic: s.hasSem,
    }));

    // Record search history (respects the user's privacy setting).
    if (query.trim()) {
      const user = await ctx.runQuery(internal.internal_ops.getUserDoc, { userId });
      const enabled = user?.searchHistoryEnabled !== false;
      if (enabled) {
        try {
          await ctx.runMutation(internal.searchHistory.record, {
            query: query.trim(),
            resultCount: results.length,
          });
        } catch {
          // non-fatal
        }
      }
    }

    return { results, count: filtered.length };
  },
});

export const askDrop = action({
  args: { query: v.string() },
  handler: async (
    ctx,
    { query },
  ): Promise<{
    answer: string | null;
    sources: Array<{
      id: Id<"drops">;
      title: string;
      summary?: string;
      category?: string;
      savedAt?: number;
      facts?: string;
    }>;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject as Id<"users"> | undefined;
    if (!userId) return { answer: null, sources: [] };

    const drops = await ctx.runQuery(internal.internal_ops.getDropsByUser, { userId });
    const visible = drops.filter((d) => !d.archived);

    const tokens = tokenize(query);
    const provider = getProvider();
    let queryVec: number[] | null = null;
    try {
      queryVec = await provider.embed(query);
    } catch {
      queryVec = null;
    }

    const scored = visible
      .map((drop) => {
        const { score: kwScore } = keywordScore(drop, tokens);
        const kwNorm = Math.min(1, kwScore / 14);
        let sem = 0;
        let hasSem = false;
        if (queryVec && drop.embedding && drop.embeddingProvider === provider.id) {
          sem = cosine(queryVec, drop.embedding);
          hasSem = sem > 0.15;
        }
        return { drop, score: hasSem ? 0.55 * sem + 0.45 * kwNorm : kwNorm };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const sources = scored.map((s) => ({
      id: s.drop._id,
      title: s.drop.title,
      summary: s.drop.summary,
      category: s.drop.category,
      savedAt: s.drop.savedAt,
      facts: buildFactString(s.drop),
    }));

    let answer: string | null = null;
    if (provider.synthesize && sources.length) {
      try {
        answer = await provider.synthesize(query, sources);
      } catch (e) {
        console.warn("Synthesis failed, falling back to results:", e);
      }
    }

    return { answer, sources };
  },
});

function buildFactString(drop: Doc<"drops">): string | undefined {
  const bits: string[] = [];
  if (drop.product?.price !== undefined) {
    bits.push(
      `${drop.product.price}${drop.product.currency ? " " + drop.product.currency : ""}${drop.product.store ? ` at ${drop.product.store}` : ""}`,
    );
  }
  if (drop.place) {
    bits.push([drop.place.name, drop.place.city, drop.place.country].filter(Boolean).join(", "));
  }
  if (drop.event?.startTime) {
    bits.push(new Date(drop.event.startTime).toLocaleDateString());
  }
  if (drop.flight) {
    bits.push(
      `flight ${drop.flight.flightNumber ?? ""} ${drop.flight.departure ?? ""} → ${drop.flight.destination ?? ""}`.trim(),
    );
  }
  if (drop.receipt?.total !== undefined) {
    bits.push(`total ${drop.receipt.total}${drop.receipt.currency ? " " + drop.receipt.currency : ""}`);
  }
  return bits.length ? bits.join(" · ") : undefined;
}
