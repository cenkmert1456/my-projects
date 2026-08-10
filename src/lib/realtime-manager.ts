/**
 * DROP — Singleton Realtime manager.
 *
 * The old architecture created one Supabase channel per hook instance with a
 * non-unique name. Under React StrictMode double-mounts, route churn and async
 * removeChannel() settling, the same channel name could receive a second
 * `postgres_changes` registration — producing the crash:
 *
 *   "Cannot add `postgres_changes` callbacks for realtime:drop-realtime-…"
 *
 * This module replaces that with a strict singleton registry:
 *
 *   - Exactly ONE channel per (userId, table, rowId) key, no matter how many
 *     screens subscribe.
 *   - Callbacks are ALWAYS registered before subscribe().
 *   - Channel names are globally unique (monotonic counter), so even a stale
 *     channel awaiting async removal can never collide with a new one.
 *   - The channel is created on first listener and removed when the last
 *     listener leaves (unmount, logout, route teardown).
 *   - Realtime is a pure enhancement: screens render from normal Supabase
 *     queries and only refetch when a change event arrives. If the realtime
 *     socket is unavailable, the manager logs (dev) and falls back to silence —
 *     the app keeps working with fetched data + manual refresh.
 */

import { supabase } from "@/lib/supabase/client";

export interface RealtimeScope {
  table: string;
  userId: string;
  /** Optional primary-key filter — e.g. a single drop or the profile row. */
  rowId?: string | null;
}

export interface RealtimeListener {
  onEvent?: () => void;
  onStatus?: (active: boolean) => void;
}

interface Entry {
  scope: RealtimeScope;
  listeners: Set<RealtimeListener>;
  channel: ReturnType<typeof supabase.channel> | null;
  active: boolean;
  name: string;
}

/** Monotonic counter guarantees globally unique channel names. */
let channelSeq = 0;

const entries = new Map<string, Entry>();

function keyOf(scope: RealtimeScope): string {
  return `${scope.userId}|${scope.table}|${scope.rowId ?? "*"}`;
}

function dispose(entry: Entry): void {
  if (entry.channel) {
    const channel = entry.channel;
    entry.channel = null;
    entry.active = false;
    // removeChannel resolves after the socket is gone — fire and forget,
    // but the reference is cleared immediately so no callback can survive.
    void supabase.removeChannel(channel).catch(() => {
      /* channel already gone — nothing to do */
    });
  }
}

/**
 * Create the singleton channel for a scope and subscribe. Only called once
 * per key — subsequent listeners just share this channel.
 */
function ensureChannel(entry: Entry): void {
  if (entry.channel) return;

  const { table, userId, rowId } = entry.scope;
  const filter = rowId ? `id=eq.${rowId}` : `user_id=eq.${userId}`;
  entry.name = `drop-live-${++channelSeq}-${table}-${userId.slice(0, 8)}`;

  const channel = supabase
    .channel(entry.name)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table, filter },
      () => {
        // Guard against a callback arriving after the channel was disposed.
        if (entry.channel !== channel) return;
        for (const listener of entry.listeners) listener.onEvent?.();
      },
    )
    .subscribe((status) => {
      if (entry.channel !== channel) return;
      if (status === "SUBSCRIBED") {
        entry.active = true;
        for (const listener of entry.listeners) listener.onStatus?.(true);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // Realtime unavailable — never crash, never block. Fall back to
        // fetched data + manual refresh. Log for dev diagnostics only.
        if (import.meta.env.DEV) {
          console.warn(`[DROP realtime] ${status} on ${entry.name}`);
        }
        dispose(entry);
      }
    });
  entry.channel = channel;
}

/**
 * Subscribe a component to realtime changes for a scope. Returns an
 * unsubscribe function. Multiple components sharing a scope share one channel.
 */
export function subscribeRealtime(
  scope: RealtimeScope,
  listener: RealtimeListener,
): () => void {
  const key = keyOf(scope);
  let entry = entries.get(key);
  if (!entry) {
    entry = { scope, listeners: new Set(), channel: null, active: false, name: "" };
    entries.set(key, entry);
  }
  entry.listeners.add(listener);

  // Report the current state immediately so the UI can show a live badge.
  listener.onStatus?.(entry.active);

  ensureChannel(entry);

  return () => {
    const current = entries.get(key);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      entries.delete(key);
      dispose(current);
    }
  };
}

/** Force a refetch on every subscriber of a scope (e.g. after pull-to-refresh). */
export function forceRealtimeSync(scope: RealtimeScope): void {
  const entry = entries.get(keyOf(scope));
  if (!entry) return;
  for (const listener of entry.listeners) listener.onEvent?.();
}

/** Drop every channel (used on logout / session change). */
export function removeAllRealtimeChannels(): void {
  for (const entry of entries.values()) dispose(entry);
  entries.clear();
}

/** Dev-only diagnostics — never exposes credentials or tokens. */
export function realtimeDiagnostics(): {
  channels: Array<{ key: string; active: boolean; listeners: number }>;
} {
  return {
    channels: Array.from(entries.entries()).map(([key, entry]) => ({
      key,
      active: entry.active,
      listeners: entry.listeners.size,
    })),
  };
}
