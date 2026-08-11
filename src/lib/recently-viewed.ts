/**
 * Recently viewed — quick access to the last Drops the user opened.
 * Stored on-device (per user), capped at 12 entries, newest first.
 */

import type { Drop } from "@/lib/supabase/database.types";

const KEY_PREFIX = "drop.recentlyViewed.";

export interface RecentlyViewedEntry {
  id: string;
  title: string;
  kind: Drop["kind"];
  category: string;
  savedAt: number;
  storagePath?: string;
}

function keyFor(userId: string): string {
  return KEY_PREFIX + userId;
}

export function recordViewed(userId: string, drop: Drop): void {
  try {
    const current = loadRecentlyViewed(userId);
    const next = [
      {
        id: drop._id,
        title: drop.title ?? "Drop",
        kind: drop.kind,
        category: drop.category,
        savedAt: drop.savedAt,
        storagePath: drop.storagePath,
      },
      ...current.filter((e) => e.id !== drop._id),
    ].slice(0, 12);
    window.localStorage.setItem(keyFor(userId), JSON.stringify(next));
  } catch {
    // best-effort
  }
}

export function loadRecentlyViewed(userId: string): RecentlyViewedEntry[] {
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentlyViewedEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch {
    return [];
  }
}
