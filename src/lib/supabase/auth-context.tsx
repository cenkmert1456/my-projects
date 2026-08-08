import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "./client";
import type { Profile } from "./database.types";
import { profileService } from "@/lib/services/profile";
import { authErrorMessage } from "./auth-errors";

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpInput {
  email: string;
  password: string;
  name?: string;
}

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: Profile | null;
  signIn: (input: SignInInput) => Promise<void>;
  /** Resolves with true when the account needs email confirmation before first login. */
  signUp: (input: SignUpInput) => Promise<{ requiresEmailConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Human-readable translation of a Supabase auth error. */
  translateError: (error: unknown) => string;
}

const AuthContext = createContext<AuthContextValue>({
  isLoading: true,
  isAuthenticated: false,
  user: null,
  signIn: async () => {},
  signUp: async () => ({ requiresEmailConfirmation: false }),
  resetPassword: async () => {},
  updatePassword: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
  translateError: (error) => authErrorMessage(error),
});

async function ensureProfile(userId: string, email?: string, name?: string): Promise<Profile | null> {
  try {
    let profile = await profileService.get(userId);
    if (!profile) {
      await profileService.upsert(userId, { name, email });
      profile = await profileService.get(userId);
    }
    return profile;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const profile = await ensureProfile(userId);
    setUser(profile);
  }, []);

  useEffect(() => {
    let disposed = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (disposed) return;
      if (data.session?.user) {
        setIsAuthenticated(true);
        void loadProfile(data.session.user.id);
      }
      setIsLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (disposed) return;
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        if (session?.user) {
          setIsAuthenticated(true);
          void loadProfile(session.user.id);
        }
      } else if (event === "SIGNED_OUT") {
        setIsAuthenticated(false);
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (input: SignInInput) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (input: SignUpInput): Promise<{ requiresEmailConfirmation: boolean }> => {
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: { data: { name: input.name ?? "" } },
    });
    if (error) throw error;
    if (data.session) {
      // Session is active immediately — profile row is created by the DB
      // trigger (handle_new_user) and/or on auth change.
      setIsAuthenticated(true);
      return { requiresEmailConfirmation: false };
    }
    // No session returned → the project has email confirmation enabled.
    // The user must click the confirmation link before signing in.
    return { requiresEmailConfirmation: Boolean(data.user) };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) await loadProfile(data.session.user.id);
  }, [loadProfile]);

  const translateError = useCallback((error: unknown) => authErrorMessage(error), []);

  const value = useMemo(
    () => ({
      isLoading,
      isAuthenticated,
      user,
      signIn,
      signUp,
      resetPassword,
      updatePassword,
      signOut,
      refreshProfile,
      translateError,
    }),
    [isLoading, isAuthenticated, user, signIn, signUp, resetPassword, updatePassword, signOut, refreshProfile, translateError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSupabaseAuth(): AuthContextValue {
  return useContext(AuthContext);
}
