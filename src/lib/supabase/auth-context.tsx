import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "./client";
import { storageAdapterReady } from "./storage-adapter";
import type { Profile } from "./database.types";
import { profileService } from "@/lib/services/profile";
import { authErrorMessage } from "./auth-errors";
import { withTimeout } from "./errors";
import { isNative } from "@/lib/mobile/platform";

/**
 * Explicit startup state machine.
 *
 *   BOOTING                  — restoring session / hydrating storage
 *   AUTHENTICATED            — valid session (online or unknown)
 *   OFFLINE_WITH_SESSION     — valid session but network is down right now
 *   UNAUTHENTICATED          — no session (or signed out)
 *   FATAL_CONFIGURATION_ERROR — backend env not configured at build time
 *
 * Navigation decisions read this instead of scattered loading booleans.
 */
export type StartupState =
  | "BOOTING"
  | "AUTHENTICATED"
  | "UNAUTHENTICATED"
  | "OFFLINE_WITH_SESSION"
  | "FATAL_CONFIGURATION_ERROR";

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
  startupState: StartupState;
  isLoading: boolean;
  isAuthenticated: boolean;
  user: Profile | null;
  signIn: (input: SignInInput) => Promise<void>;
  /** Resolves with true when the account needs email confirmation before first login. */
  signUp: (input: SignUpInput) => Promise<{ requiresEmailConfirmation: boolean }>;
  /** Real Google OAuth via Supabase — browser redirect on web, custom-tab + deep link on native. */
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Human-readable translation of a Supabase auth / network error. */
  translateError: (error: unknown) => string;
}

const AuthContext = createContext<AuthContextValue>({
  startupState: "BOOTING",
  isLoading: true,
  isAuthenticated: false,
  user: null,
  signIn: async () => {},
  signUp: async () => ({ requiresEmailConfirmation: false }),
  signInWithGoogle: async () => {},
  resetPassword: async () => {},
  resendConfirmation: async () => {},
  updatePassword: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
  translateError: (error) => authErrorMessage(error),
});

interface ProfileMeta {
  email?: string;
  name?: string;
  image?: string;
}

/** Pull friendly profile metadata from a Supabase user (incl. Google OAuth). */
function metaFromUser(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }): ProfileMeta {
  const m = user.user_metadata ?? {};
  const name =
    (m.full_name as string | undefined) ||
    (m.name as string | undefined) ||
    (m.given_name as string | undefined) ||
    undefined;
  const image =
    (m.avatar_url as string | undefined) ||
    (m.picture as string | undefined) ||
    (m.avatar as string | undefined) ||
    undefined;
  return { email: user.email ?? undefined, name, image };
}

/**
 * If the profile row can't be fetched or created (RLS not provisioned yet,
 * network blip), fall back to a profile derived from the authenticated
 * Supabase user so the UI NEVER shows a logged-in person as "Guest account".
 */
function fallbackProfile(userId: string, meta?: ProfileMeta): Profile {
  const now = Date.now();
  return {
    id: userId,
    name: meta?.name,
    email: meta?.email,
    image: meta?.image,
    role: "user",
    plan: "free",
    onboardingDone: true,
    searchHistoryEnabled: true,
    dailyRecallEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

async function ensureProfile(userId: string, meta?: ProfileMeta): Promise<Profile | null> {
  try {
    let profile = await profileService.get(userId);
    if (!profile) {
      await profileService.upsert(userId, {
        name: meta?.name,
        email: meta?.email,
        image: meta?.image,
      });
      profile = await profileService.get(userId);
    } else if (meta?.email && !profile.email) {
      // Repair: the trigger may have created the row without the email.
      await profileService.upsert(userId, { email: meta.email });
      profile = { ...profile, email: meta.email };
    }
    return profile;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [startupState, setStartupState] = useState<StartupState>("BOOTING");
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (userId: string, meta?: ProfileMeta) => {
    const profile = await ensureProfile(userId, meta);
    setUser(profile ?? fallbackProfile(userId, meta));
  }, []);

  // Boot: await storage hydration (native cold start), restore session, then
  // settle into one explicit startup state.
  useEffect(() => {
    let disposed = false;

    const boot = async () => {
      try {
        await storageAdapterReady;
      } catch {
        // non-fatal — session restore just finds nothing
      }
      if (disposed) return;
      const { data } = await supabase.auth.getSession();
      if (disposed) return;
      const session = data.session;
      if (session?.user) {
        setIsAuthenticated(true);
        void loadProfile(session.user.id, metaFromUser(session.user));
        setStartupState(typeof navigator !== "undefined" && navigator.onLine === false ? "OFFLINE_WITH_SESSION" : "AUTHENTICATED");
      } else if (!isSupabaseConfigured) {
        setStartupState("FATAL_CONFIGURATION_ERROR");
      } else {
        setStartupState("UNAUTHENTICATED");
      }
      setIsLoading(false);
    };
    void boot();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (disposed) return;
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        if (session?.user) {
          setIsAuthenticated(true);
          setStartupState((s) => (s === "OFFLINE_WITH_SESSION" ? s : "AUTHENTICATED"));
          void loadProfile(session.user.id, metaFromUser(session.user));
        }
      } else if (event === "SIGNED_OUT") {
        setIsAuthenticated(false);
        setUser(null);
        setStartupState("UNAUTHENTICATED");
      }
      setIsLoading(false);
    });

    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (input: SignInInput) => {
    const { error } = await withTimeout(
      supabase.auth.signInWithPassword({
        email: input.email.trim().toLowerCase(),
        password: input.password,
      }),
      15000,
    );
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (input: SignUpInput): Promise<{ requiresEmailConfirmation: boolean }> => {
    const emailRedirectTo = isNative()
      ? "drop://drop/auth/callback"
      : `${window.location.origin}/auth`;
    const { data, error } = await withTimeout(
      supabase.auth.signUp({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        options: {
          data: { name: input.name ?? "" },
          emailRedirectTo,
        },
      }),
      15000,
    );
    if (error) throw error;
    if (data.session) {
      // Session is active immediately — profile row is created by the DB
      // trigger (handle_new_user) and/or on auth change.
      setIsAuthenticated(true);
      return { requiresEmailConfirmation: false };
    }
    // No session returned → the project has email confirmation enabled.
    return { requiresEmailConfirmation: Boolean(data.user) };
  }, []);

  /**
   * Real Google Sign-In through Supabase Auth.
   *
   * Web:   supabase-js redirects to Google and back to /auth (PKCE exchange
   *        handled by detectSessionInUrl on the fresh page load).
   * Native: opens a custom tab (skipBrowserRedirect) pointing at Google; the
   *        OAuth redirect goes to drop://drop/auth/callback, where the global
   *        AuthCallbackHandler exchanges the code and creates the session.
   */
  const signInWithGoogle = useCallback(async () => {
    if (isNative()) {
      const { Browser } = await import("@capacitor/browser");
      const { data, error } = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            skipBrowserRedirect: true,
            redirectTo: "drop://drop/auth/callback",
          },
        }),
        15000,
      );
      if (error) throw error;
      if (data?.url) await Browser.open({ url: data.url });
      return;
    }
    const { error } = await withTimeout(
      supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth` },
      }),
      15000,
    );
    if (error) throw error;
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const redirectTo = isNative()
      ? "drop://drop/auth/callback"
      : `${window.location.origin}/auth?mode=reset`;
    const { error } = await withTimeout(
      supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo }),
      15000,
    );
    if (error) throw error;
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const emailRedirectTo = isNative()
      ? "drop://drop/auth/callback"
      : `${window.location.origin}/auth`;
    const { error } = await withTimeout(
      supabase.auth.resend({
        type: "signup",
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo },
      }),
      15000,
    );
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await withTimeout(supabase.auth.updateUser({ password }), 15000);
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      setStartupState("UNAUTHENTICATED");
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) await loadProfile(data.session.user.id, metaFromUser(data.session.user));
  }, [loadProfile]);

  const translateError = useCallback((error: unknown) => authErrorMessage(error), []);

  const value = useMemo(
    () => ({
      startupState,
      isLoading,
      isAuthenticated,
      user,
      signIn,
      signUp,
      signInWithGoogle,
      resetPassword,
      resendConfirmation,
      updatePassword,
      signOut,
      refreshProfile,
      translateError,
    }),
    [
      startupState,
      isLoading,
      isAuthenticated,
      user,
      signIn,
      signUp,
      signInWithGoogle,
      resetPassword,
      resendConfirmation,
      updatePassword,
      signOut,
      refreshProfile,
      translateError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSupabaseAuth(): AuthContextValue {
  return useContext(AuthContext);
}
