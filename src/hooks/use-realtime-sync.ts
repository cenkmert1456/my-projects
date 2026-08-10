import { useEffect, useRef, useState } from "react";
import {
  forceRealtimeSync,
  subscribeRealtime,
  type RealtimeScope,
} from "@/lib/realtime-manager";

export interface RealtimeSyncResult {
  /** true when the realtime channel is live (subtle "synced" indicator). */
  active: boolean;
  /** Ask every subscriber of the same scope to refetch now. */
  forceSync: () => void;
}

/**
 * Optional Realtime enhancement — wire it to a screen's refetch.
 *
 * This is intentionally separate from data loading: the screen fetches and
 * renders from `useRealtimeQuery` regardless; realtime only triggers a
 * refetch when a change arrives. If the realtime socket fails, the manager
 * logs (dev) and this hook silently reports active=false — the app keeps
 * working with fetched data and manual refresh.
 */
export function useRealtimeSync(
  scope: RealtimeScope | null,
  onEvent?: () => void,
): RealtimeSyncResult {
  const [active, setActive] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!scope?.userId) {
      setActive(false);
      return;
    }
    const unsubscribe = subscribeRealtime(scope, {
      onEvent: () => onEventRef.current?.(),
      onStatus: (isActive) => setActive(isActive),
    });
    return unsubscribe;
  }, [scope?.userId, scope?.table, scope?.rowId]);

  return {
    active,
    forceSync: () => {
      if (scope?.userId) forceRealtimeSync(scope);
    },
  };
}
