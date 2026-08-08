import { useSupabaseAuth } from "@/lib/supabase/auth-context";

/**
 * useAuth — the app's auth hook.
 *
 * Backed by Supabase Auth (email/password + Google OAuth). The public shape:
 * `{ startupState, isLoading, isAuthenticated, user, signIn, signUp,
 * signInWithGoogle, resetPassword, resendConfirmation, updatePassword,
 * signOut }`. `user` is the DROP profile row.
 *
 * `startupState` is the explicit boot machine: BOOTING → AUTHENTICATED /
 * UNAUTHENTICATED / OFFLINE_WITH_SESSION / FATAL_CONFIGURATION_ERROR.
 */
export function useAuth() {
  return useSupabaseAuth();
}
