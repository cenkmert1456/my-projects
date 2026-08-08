import { useEffect } from "react";
import { useNavigate } from "react-router";
import { registerDeepLinkListener, type DeepLink } from "@/lib/mobile/native";

/**
 * Global auth-callback handler (mounted once in main.tsx, inside the router).
 *
 * Handles Supabase auth deep links that can arrive while the user is on the
 * Auth screen (or anywhere else):
 *
 *   drop://drop/auth/callback#access_token=…&refresh_token=…&type=recovery
 *   drop://drop/auth/callback?code=…            (PKCE Google OAuth)
 *
 * On native the exchange result arrives as a deep link; on web supabase-js
 * picks the code up from the URL itself (detectSessionInUrl), so this
 * component is effectively native-only — but harmless everywhere.
 *
 * After a successful exchange:
 *   - type=recovery → /auth?mode=reset (new-password screen)
 *   - otherwise     → /app (Home)
 */
export function AuthCallbackHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    let disposed = false;

    const handle = async (link: DeepLink) => {
      if (disposed) return;
      const parts = link.path.split("/");
      if (parts[0] !== "auth") return;

      const { supabase } = await import("@/lib/supabase/client");
      const frag = new URLSearchParams((link.raw ?? "").split("#")[1] ?? "");
      const type = frag.get("type") ?? link.query.type ?? "";
      const code = frag.get("code") ?? link.query.code ?? "";
      const accessToken = frag.get("access_token") ?? "";
      const refreshToken = frag.get("refresh_token") ?? "";

      try {
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        } else if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch {
        // exchange failed — fall through; the auth page shows a clear state
      }

      if (type === "recovery") navigate("/auth?mode=reset", { replace: true });
      else navigate("/app", { replace: true });
    };

    const dispose = registerDeepLinkListener(handle);
    return () => {
      disposed = true;
      dispose();
    };
  }, [navigate]);

  return null;
}
