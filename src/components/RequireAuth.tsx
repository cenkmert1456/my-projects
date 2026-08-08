import { useAuth } from "@/hooks/use-auth";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { BootScreen } from "@/components/app/BootScreen";
import { ConfigErrorScreen } from "@/components/app/ConfigErrorScreen";

/**
 * Route guard driven by the explicit startup state machine.
 *
 *   BOOTING                   → branded boot screen (no flash, no blank page)
 *   FATAL_CONFIGURATION_ERROR → clear "backend not configured" screen
 *   AUTHENTICATED / OFFLINE_WITH_SESSION → render the protected content
 *   UNAUTHENTICATED           → redirect to /auth with the intended path
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { startupState, isAuthenticated } = useAuth();
  const location = useLocation();

  if (startupState === "BOOTING") {
    return <BootScreen />;
  }

  if (startupState === "FATAL_CONFIGURATION_ERROR") {
    return <ConfigErrorScreen />;
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  return children;
}
