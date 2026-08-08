"use node";

// Hybrid search: DROP combines
//   1. keyword scoring  (titles, summaries, keywords, tags, text, OCR)
//   2. semantic vectors (cosine similarity over embeddings)
//   3. metadata filters (category, kind, source, place, price, dates, tags)
// and ranks everything together, so vague natural-language queries like
// "that weird lamp I liked" still surface the right Drop.
//
// Natural time language is parsed into date filters:
//   "today", "yesterday", "last week", "last month", "in June",
//   "three months ago", "saved around March" …
//
// Scale note (MVP): each search scans the user's own Drops and scores them in
// memory. That is fine for a personal memory (hundreds–low thousands of
// Drops). The natural upgrade path is a vector index — the schema already
// isolates embeddings for that migration.

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { resolveProvider } from "./ai";
import type { Doc, Id } from "./_generated/dataModel";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with",
  "my", "i", "me", "is", "was", "are", "were", "that", "this", "what",
  "where", "when", "how", "did", "do", "does", "have", "has", "had", "it",
  "its", "from", "by", "at", "as", "be", "been", "about", "find", "show",
  "saved", "save", "drop", "anything", "everything", "one", "two", "can",
  "you", "your", "all", "any", "but", "not", "so", "if", "then", "than",
  "too", "very", "just", "also", "more", "most", "some", "such", "only",
  "around", "during", "near", "before", "after", "since", "between",
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

const DAY = 1000 * 60 * 60 * 24;
const MONTHS = ["january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"];

/** Parse fuzzy human time phrases into a date window (ms epoch). */
export function timeWindowFromQuery(query: string): { dateFrom?: number; dateTo?: number } | null {
  const q = query.toLowerCase();
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const rel = (days: number) => ({ dateFrom: todayMs - days * DAY, dateTo: todayMs + DAY });

  if (/\btoday\b/.test(q)) return rel(0);
  if (/\byesterday\b/.test(q)) return { dateFrom: todayMs - DAY, dateTo: todayMs };
  if (/\bthis week\b/.test(q)) return rel(6);
  if (/\blast week\b/.test(q)) return { dateFrom: todayMs - 14 * DAY, dateTo: todayMs - 6 * DAY };
  if (/\blast month\b/.test(q)) return { dateFrom: todayMs - 62 * DAY, dateTo: todayMs - 28 * DAY };
  if (/\bthis month\b/.test(q)) return rel(29);
  if (/\bthis year\b/.test(q)) return { dateFrom: new Date(new Date().getFullYear(), 0, 1).getTime() };

  // "last N days" / "past N days"
  const daysMatch = q.match(/\b(?:last|past|previous)\s+(\d+)\s+days?\b/);
  if (daysMatch) return rel(parseInt(daysMatch[1], 10));

  // "N weeks/months ago"
  const agoMatch = q.match(/(\d+)\s+(weeks?|months?|days?)\s+ago/);
  if (agoMatch) {
    const n = parseInt(agoMatch[1], 10);
    const unit = agoMatch[2];
    const days = unit.startsWith("week") ? n * 7 : unit.startsWith("month") ? n * 30 : n;
    return { dateFrom: todayMs - (days + 1) * DAY, dateTo: todayMs - (days - 1) * DAY };
  }
  const agoWeeks = q.match(/\b(?:a|one)\s+week\s+ago\b/);
  if (agoWeeks) return { dateFrom: todayMs - 8 * DAY, dateTo: todayMs - 6 * DAY };

  // Month names: "in June", "around March", "saved June"
  for (let i = 0; i < MONTHS.length; i++) {
    if (new RegExp(`\\b${MONTHS[i]}\\b`).test(q)) {
      const year = new Date().getFullYear();
      const monthStart = new Date(year, i, 1).getTime();
      const monthEnd = new Date(year, i + 1, 1).getTime();
      // If the month already passed this year, assume last year.
      if (monthEnd < todayMs) {
        return {
          dateFrom: new Date(year - 1, i, 1).getTime(),
          dateTo: new Date(year - 1, i + 1, 1).getTime(),
        };
      }
      return { dateFrom: monthStart, dateTo: monthEnd };
    }
  }

  return null;
}

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
    [drop.notes ?? "", 1.5],
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
    // Natural time language → date window (user filters win).
    const timeWindow = timeWindowFromQuery(query);
    if (timeWindow) {
      f.dateFrom = f.dateFrom ?? timeWindow.dateFrom;
      f.dateTo = f.dateTo ?? timeWindow.dateTo;
    }
    const limit = Math.min(f.limit ?? 30, 50);

    let drops = await ctx.runQuery(internal.internal_ops.getDropsByUser, { userId });
    drops = drops.filter((d) => !d.deletedAt);
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
    const provider = await resolveProvider();
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
      let combined = hasSem ? 0.55 * sem + 0.45 * kwNorm : kwNorm;
      // Favorites nudge genuinely-close results (never bury relevance).
      if (drop.starred) combined = Math.min(1, combined + 0.04);
      return { drop, score: combined, kwScore, sem, hasSem, matched };
    });

    const filtered = scored.filter((s) => passesFilters(s.drop, f));

    filtered.sort((a, b) => {
      if (tokens.length === 0) return b.drop.savedAt - a.drop.savedAt;
      if (Math.abs(b.score - a.score) > 0.0001) return b.score - a.score;
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

const ASK_HISTORY = v.array(
  v.object({ role: v.union(v.literal("user"), v.literal("assistant")), content: v.string() }),
);

export const askDrop = action({
  args: {
    query: v.string(),
    history: v.optional(ASK_HISTORY),
    dropId: v.optional(v.id("drops")),
    collectionId: v.optional(v.id("collections")),
  },
  handler: async (
    ctx,
    { query, history, dropId, collectionId },
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

    let drops = await ctx.runQuery(internal.internal_ops.getDropsByUser, { userId });
    drops = drops.filter((d) => !d.deletedAt && !d.archived);

    // Scope: single Drop (Ask about this Drop) or a Collection.
    if (dropId) {
      const target = drops.find((d) => d._id === dropId);
      if (!target) return { answer: null, sources: [] };
      const related = drops
        .filter((d) => d._id !== dropId && d.category === target.category)
        .slice(0, 6);
      drops = [target, ...related];
    } else if (collectionId) {
      const ids = await ctx.runQuery(internal.internal_ops.getCollectionDropIds, { collectionId });
      const idSet = new Set(ids.map((i) => i.toString()));
      drops = drops.filter((d) => idSet.has(d._id.toString()));
    }

    const tokens = tokenize(query);
    const provider = await resolveProvider();
    let queryVec: number[] | null = null;
    try {
      queryVec = await provider.embed(query);
    } catch {
      queryVec = null;
    }

    const scored = drops
      .map((drop) => {
        const { score: kwScore } = keywordScore(drop, tokens);
        const kwNorm = Math.min(1, kwScore / 14);
        let sem = 0;
        let hasSem = false;
        if (queryVec && drop.embedding && drop.embeddingProvider === provider.id) {
          sem = cosine(queryVec, drop.embedding);
          hasSem = sem > 0.15;
        }
        const base = hasSem ? 0.55 * sem + 0.45 * kwNorm : kwNorm;
        return { drop, score: dropId ? 0.6 + base : base };
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
        answer = await synthesizeWithHistory(provider, query, sources, history);
      } catch (e) {
        console.warn("Synthesis failed, falling back to results:", e);
      }
    }

    return { answer, sources };
  },
});

async function synthesizeWithHistory(
  provider: { synthesize?: (q: string, sources: Array<{ id: Id<"drops">; title: string; summary?: string; category?: string; savedAt?: number; facts?: string }>) => Promise<string | null> },
  query: string,
  sources: Array<{ id: Id<"drops">; title: string; summary?: string; category?: string; savedAt?: number; facts?: string }>,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string | null> {
  if (!provider.synthesize) return null;
  const turns = (history ?? []).slice(-4);
  const withContext = turns.length
    ? `(Conversation so far:\n${turns.map((t) => `${t.role}: ${t.content}`).join("\n")}\n)\n\n${query}`
    : query;
  return provider.synthesize(withContext, sources);
}

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
  if (drop.receipt?.returnDeadline) {
    bits.push(`return deadline ${new Date(drop.receipt.returnDeadline).toLocaleDateString()}`);
  }
  if (drop.notes) bits.push(`note: ${drop.notes}`);
  return bits.length ? bits.join(" · ") : undefined;
}
