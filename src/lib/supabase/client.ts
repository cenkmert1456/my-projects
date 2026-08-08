import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseStorageAdapter } from "./storage-adapter";
import type { Database } from "./database.types";

/**
 * DROP — Supabase client.
 *
 * Only the public anon/publishable key is ever used on the client. All
 * ownership enforcement happens server-side via Row Level Security — never
 * put the service-role key in frontend code.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Both names are accepted — newer Supabase SDKs/docs call it the
// "publishable" key; older projects use VITE_SUPABASE_ANON_KEY.
const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL ?? "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY ?? "placeholder-anon-key",
  {
    auth: {
      storage: supabaseStorageAdapter,
      storageKey: "drop-auth",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  },
);

/** Promise-based current user id — used by services. */
export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
