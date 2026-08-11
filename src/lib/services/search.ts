/**
 * searchService — hybrid search (keyword + on-device embeddings + metadata
 * filters) and Ask DROP (grounded retrieval → local engine synthesis).
 *
 * Port of the old backend search action. Every query is scoped to the
 * authenticated user id; embeddings come from DROP Native AI (same
 * deterministic algorithm across web/native), stored per-drop.
 */

import { supabase } from "@/lib/supabase/client";
import { cosineSimilarity, dropEmbedText } from "@/lib/embed";
import { loadCachedDrops } from "@/lib/local-cache";
import type {
  AskResult,
  AskSource,
  Drop,
  SearchFilters,
  SearchHit,
  SearchHistory,
} from "@/lib/supabase/database.types";
import { rowToDrop, rowToSearchHistory } from "./mappers";
import { dropService, EMBEDDING_PROVIDER } from "./drops";

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

const DAY = 1000 * 60 * 60 * 24;
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9€$£¥à-ÿ]+/)
    .filter(Boolean);
}

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

  const daysMatch = q.match(/\b(?:last|past|previous)\s+(\d+)\s+days?\b/);
  if (daysMatch) return rel(parseInt(daysMatch[1], 10));

  const agoMatch = q.match(/(\d+)\s+(weeks?|months?|days?)\s+ago/);
  if (agoMatch) {
    const n = parseInt(agoMatch[1], 10);
    const unit = agoMatch[2];
    const days = unit.startsWith("week") ? n * 7 : unit.startsWith("month") ? n * 30 : n;
    return { dateFrom: todayMs - (days + 1) * DAY, dateTo: todayMs - (days - 1) * DAY };
  }
  const agoWeeks = q.match(/\b(?:a|one)\s+week\s+ago\b/);
  if (agoWeeks) return { dateFrom: todayMs - 8 * DAY, dateTo: todayMs - 6 * DAY };

  for (let i = 0; i < MONTHS.length; i++) {
    if (new RegExp(`\\b${MONTHS[i]}\\b`).test(q)) {
      const year = new Date().getFullYear();
      const monthStart = new Date(year, i, 1).getTime();
      const monthEnd = new Date(year, i + 1, 1).getTime();
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

function keywordScore(drop: Drop, tokens: string[]): { score: number; matched: string[] } {
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

function passesFilters(drop: Drop, f: SearchFilters): boolean {
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

export const searchService = {
  async searchDrops(
    userId: string,
    query: string,
    filters?: SearchFilters,
  ): Promise<{ results: SearchHit[]; count: number; fromCache?: boolean }> {
    const f = filters ?? {};
    const timeWindow = timeWindowFromQuery(query);
    if (timeWindow) {
      f.dateFrom = f.dateFrom ?? timeWindow.dateFrom;
      f.dateTo = f.dateTo ?? timeWindow.dateTo;
    }
    const limit = Math.min(f.limit ?? 30, 50);

    // Layered search (Part P): fetch from Supabase; if the backend is
    // unreachable/misconfigured, fall back to the on-device snapshot so
    // search never dies entirely. Search stays scoped to the current user in
    // both layers.
    let drops: Drop[];
    let fromCache = false;
    try {
      if (f.collectionId) {
        drops = await dropService.byCollection(userId, f.collectionId);
      } else {
        drops = await dropService.listAll(userId, f.includeArchived);
      }
    } catch (err) {
      const cached = loadCachedDrops(userId);
      if (cached && cached.length) {
        drops = cached;
        fromCache = true;
      } else {
        throw err;
      }
    }
    drops = drops.filter((d) => !d.deletedAt);

    const tokens = tokenize(query);
    const queryVec = tokens.length ? dropEmbedText(query) : null;

    const scored = drops.map((drop) => {
      const { score: kwScore, matched } = keywordScore(drop, tokens);
      const kwNorm = tokens.length ? Math.min(1, kwScore / 14) : 0;
      let sem = 0;
      let hasSem = false;
      if (tokens.length && queryVec && drop.embedding && drop.embeddingProvider === EMBEDDING_PROVIDER) {
        sem = cosineSimilarity(queryVec, drop.embedding);
        hasSem = sem > 0;
      }
      let combined = hasSem ? 0.55 * sem + 0.45 * kwNorm : kwNorm;
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

    if (query.trim()) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("search_history_enabled")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.search_history_enabled !== false) {
        await this.recordSearch(userId, query.trim(), results.length);
      }
    }

    return { results, count: filtered.length, fromCache };
  },

  /** Ask DROP — retrieve the user's relevant Drops, then synthesize with the
   *  local engine. Answers are always grounded in saved content. */
  async askDrop(
    userId: string,
    params: {
      query: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      dropId?: string;
      collectionId?: string;
    },
  ): Promise<AskResult> {
    let drops = await dropService.listAll(userId);
    drops = drops.filter((d) => !d.deletedAt && !d.archived);

    if (params.dropId) {
      const target = drops.find((d) => d.id === params.dropId);
      if (!target) return { answer: null, sources: [] };
      const related = drops.filter((d) => d.id !== params.dropId && d.category === target.category).slice(0, 6);
      drops = [target, ...related];
    } else if (params.collectionId) {
      drops = await dropService.byCollection(userId, params.collectionId);
    }

    const tokens = tokenize(params.query);
    const queryVec = dropEmbedText(params.query);

    const scored = drops
      .map((drop) => {
        const { score: kwScore } = keywordScore(drop, tokens);
        const kwNorm = Math.min(1, kwScore / 14);
        let sem = 0;
        let hasSem = false;
        if (queryVec && drop.embedding && drop.embeddingProvider === EMBEDDING_PROVIDER) {
          sem = cosineSimilarity(queryVec, drop.embedding);
          hasSem = sem > 0.15;
        }
        const base = hasSem ? 0.55 * sem + 0.45 * kwNorm : kwNorm;
        return { drop, score: params.dropId ? 0.6 + base : base };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const sources: AskSource[] = scored.map((s) => ({
      id: s.drop.id,
      title: s.drop.title,
      summary: s.drop.summary,
      category: s.drop.category,
      savedAt: s.drop.savedAt,
      facts: buildFactString(s.drop),
    }));

    let answer: string | null = null;
    if (sources.length) {
      const { getDropAI } = await import("@/lib/drop-ai");
      const engine = await getDropAI();
      try {
        const turns = (params.history ?? []).slice(-4);
        const withContext = turns.length
          ? `(Conversation so far:\n${turns.map((t) => `${t.role}: ${t.content}`).join("\n")}\n)\n\n${params.query}`
          : params.query;
        const context = sources
          .map((s) => `- ${s.title}${s.summary ? ` — ${s.summary}` : ""}${s.facts ? ` (${s.facts})` : ""}`)
          .join("\n");
        const prompt = `Answer the question using ONLY the saved content below. If the content doesn't contain the answer, say so. Be concise.\n\nSaved content:\n${context}\n\nQuestion: ${withContext}`;
        answer = await engine.generateText(prompt);
      } catch {
        answer = null;
      }
    }

    return { answer, sources };
  },

  // -------------------------------------------------------------------------
  // Search history
  // -------------------------------------------------------------------------

  async listSearchHistory(userId: string, limit = 20): Promise<SearchHistory[]> {
    const { data, error } = await supabase
      .from("search_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(rowToSearchHistory);
  },

  async recordSearch(userId: string, query: string, resultCount?: number): Promise<void> {
    const { error } = await supabase
      .from("search_history")
      .insert({ user_id: userId, query, result_count: resultCount });
    if (error && !error.message.includes("duplicate")) {
      // non-fatal for search UX
    }
  },

  async clearSearchHistory(userId: string): Promise<void> {
    const { error } = await supabase.from("search_history").delete().eq("user_id", userId);
    if (error) throw error;
  },
};

function buildFactString(drop: Drop): string | undefined {
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
