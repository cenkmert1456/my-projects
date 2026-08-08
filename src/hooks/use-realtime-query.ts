import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export interface RealtimeQueryOptions {
  /** Table to subscribe to (drops, collections, stacks, reminders, …). */
  table: string;
  /** Owner id — used both for the RLS-scoped subscription filter and as a dep. */
  userId?: string | null;
  /** Optional primary key filter (e.g. a single drop) — null = all owned rows. */
  rowId?: string | null;
}

export interface RealtimeQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Reactive data hook — the useQuery replacement.
 *
 * Fetches through the provided fetcher, then subscribes to Supabase Realtime
 * (postgres_changes) for the given table, scoped to the owner. Any
 * insert/update/delete to the user's own rows triggers a refetch, so screens
 * stay live without polling.
 */
export function useRealtimeQuery<T>(
  fetcher: () => Promise<T>,
  options: RealtimeQueryOptions,
): RealtimeQueryResult<T> {
  const { table, userId, rowId } = options;
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!userId) {
      setData(undefined);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetcherRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, tick]);

  useEffect(() => {
    if (!userId) return;
    const filter = rowId ? `id=eq.${rowId}` : `user_id=eq.${userId}`;
    const channel = supabase
      .channel(`drop-realtime-${table}-${userId}-${rowId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        () => setTick((t) => t + 1),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, userId, rowId]);

  return { data, loading, error, refetch };
}
