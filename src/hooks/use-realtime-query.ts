import { useCallback, useEffect, useRef, useState } from "react";
import { authErrorMessage } from "@/lib/supabase/auth-errors";
import { withTimeout } from "@/lib/supabase/errors";

export interface RealtimeQueryOptions {
  /** Table the data comes from — kept for API compatibility. */
  table: string;
  /** Owner id — when absent the query settles immediately (never spins). */
  userId?: string | null;
  /** Optional primary key filter (e.g. a single drop) — kept for compatibility. */
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
 * Plain Supabase query hook — the useQuery replacement.
 *
 * Deliberately has NO realtime channels: Realtime is an optional enhancement
 * provided by `useRealtimeSync`, which refetches through this hook's refetch.
 * Fetch-on-mount + manual refresh means the app can never be blocked or
 * crashed by a Realtime subscription — if realtime is unavailable, screens
 * still load and render normally.
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
  const { userId } = options;
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
        // transient failure never blanks the screen. The real Supabase error
        // is logged (it surfaces in logcat on Android) so "couldn't load"
        // screens are never a black box.
        const raw = err instanceof Error ? err.message : String(err);
        console.error(`[drop:query:${options.table}]`, raw);
        setError(authErrorMessage(err, "Couldn't load your data — pull to refresh."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, tick]);

  return { data, loading, error, refetch };
}
