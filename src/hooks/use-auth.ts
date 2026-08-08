import { useSupabaseAuth } from "@/lib/supabase/auth-context";

/**
 * useAuth — the app's auth hook.
 *
 * Backed by Supabase Auth (email/password). The public shape is unchanged:
 * `{ isLoading, isAuthenticated, user, signIn, signUp, resetPassword,
 * updatePassword, signOut }`. `user` is the DROP profile row.
 */
export function useAuth() {
  return useSupabaseAuth();
}
