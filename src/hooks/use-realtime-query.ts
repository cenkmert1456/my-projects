import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/auth-errors";
import { withTimeout } from "@/lib/supabase/errors";

export interface RealtimeQueryOptions {
  /** Table to subscribe to (drops, collections, stacks, reminders, …). */
  table: string;
  /** Owner id — used both for the RLS-scoped subscription filter and as a dep. */
  userId?: string | null;
  /** Optional primary key filter (e.g. a single drop) — null = all owned rows. */
  rowId?: string | null;
}

export interface RealtimeQueryResult<T> {
  /** undefined while nothing has loaded yet (initial fetch). */
  data: T | undefined;
  /** true only while the initial fetch (or a refetch) is in flight. */
  loading: boolean;
  /** Human-readable message when the last fetch failed — never raw errors. */
  error: string | null;
  refetch: () => void;
}

/**
 * Reactive data hook — the useQuery replacement.
 *
 * Fetches through the provided fetcher (wrapped in a 12s timeout so a dead
 * network can never leave a screen spinning), then subscribes to Supabase
 * Realtime (postgres_changes) for the given table, scoped to the owner.
 *
 * State contract (screens should render all four explicitly):
 *   - data === undefined && loading  → INITIAL_LOADING (skeleton)
 *   - data !== undefined             → READY (even when [] → EMPTY)
 *   - error && data === undefined    → ERROR (with retry)
 *   - error && data !== undefined    → stale data + quiet error
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
      // Not signed in (yet): settle immediately so guards never spin.
      setData(undefined);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // Timeout guard: a stalled request resolves as an error instead of
    // leaving the screen in an endless spinner.
    withTimeout(fetcherRef.current(), 12000)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Keep any previously loaded data (stale-while-revalidate) so a
        // transient failure never blanks the screen.
        setError(authErrorMessage(err, "Couldn't load your data — pull to refresh."));
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
