/**
 * Local drops cache — a compact snapshot of the user's drops kept on-device
 * after every successful fetch.
 *
 * Purpose: search and Home stay useful even when Supabase is unreachable or
 * misconfigured. The snapshot powers the layered-search fallback (Part P) so
 * the user never sees a dead "couldn't search" screen when they have content
 * on this device.
 *
 * Only searchable metadata is stored (never file bytes); the cache is capped
 * and silently ignored on failure.
 */

import type { Drop } from "@/lib/supabase/database.types";

const KEY_PREFIX = "drop.localCache.";

interface CacheEntry {
  id: string;
  title: string;
  summary?: string;
  keywords: string[];
  tags: string[];
  text?: string;
  ocrText?: string;
  notes?: string;
  category: string;
  subcategory?: string;
  kind: string;
  source?: string;
  savedAt: number;
  storagePath?: string;
  starred: boolean;
  entities: string[];
  placeText?: string;
  productText?: string;
}

const MAX_ENTRIES = 300;

function toEntry(d: Drop): CacheEntry {
  return {
    id: d._id,
    title: d.title ?? "",
    summary: d.summary,
    keywords: d.keywords ?? [],
    tags: d.tags ?? [],
    text: d.text,
    ocrText: d.ocrText,
    notes: d.notes,
    category: d.category,
    subcategory: d.subcategory,
    kind: d.kind,
    source: d.source,
    savedAt: d.savedAt,
    storagePath: d.storagePath,
    starred: Boolean(d.starred),
    entities: (d.entities ?? []).map((e) => e.value),
    placeText: d.place ? [d.place.name, d.place.city, d.place.country].filter(Boolean).join(" ") : undefined,
    productText: d.product?.name,
  };
}

function keyFor(userId: string): string {
  return KEY_PREFIX + userId;
}

export function cacheDrops(userId: string, drops: Drop[]): void {
  try {
    const entries = drops
      .filter((d) => !d.deletedAt)
      .slice(0, MAX_ENTRIES)
      .map(toEntry);
    window.localStorage.setItem(keyFor(userId), JSON.stringify(entries));
  } catch {
    // cache is best-effort
  }
}

export function loadCachedDrops(userId: string): Drop[] | null {
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const entries = JSON.parse(raw) as CacheEntry[];
    if (!Array.isArray(entries)) return null;
    const now = Date.now();
    return entries.map(
      (e) =>
        ({
          id: e.id,
          _id: e.id,
          userId,
          kind: e.kind as Drop["kind"],
          title: e.title,
          summary: e.summary,
          category: e.category,
          subcategory: e.subcategory,
          keywords: e.keywords,
          tags: e.tags,
          starred: e.starred,
          archived: false,
          pinned: false,
          sensitive: false,
          locked: false,
          savedAt: e.savedAt,
          status: "ready" as const,
          analysisStatus: "done" as const,
          entities: e.entities.map((value) => ({ type: "", value, confidence: 0 })),
          text: e.text,
          ocrText: e.ocrText,
          notes: e.notes,
          source: e.source,
          storagePath: e.storagePath,
          searchText: [e.title, e.summary, e.text, e.ocrText, e.notes, e.category, ...e.keywords, ...e.tags, e.placeText, e.productText]
            .filter(Boolean)
            .join(" "),
          createdAt: now,
          updatedAt: now,
        }) as Drop,
    );
  } catch {
    return null;
  }
}

export function clearDropsCache(userId: string): void {
  try {
    window.localStorage.removeItem(keyFor(userId));
  } catch {
    // ignore
  }
}
