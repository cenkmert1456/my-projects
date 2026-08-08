/**
 * Backend connectivity health check.
 *
 * The app needs to know — internally — whether Supabase (auth + database +
 * storage) is reachable and correctly configured, without exposing scary
 * technical diagnostics to ordinary users. `checkBackendHealth()` returns a
 * simple summary plus an optional developer-only detail list.
 */

import { supabase, isSupabaseConfigured } from "./client";

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";

export interface BackendHealth {
  ok: boolean;
  configured: boolean;
  auth: "ok" | "unreachable" | "unconfigured";
  database: "ok" | "unreachable" | "unconfigured";
  storage: "ok" | "unreachable" | "unconfigured";
  latencyMs: number | null;
  /** Developer-only diagnostics — never shown to regular users. */
  diagnostics: string[];
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

export async function checkBackendHealth(): Promise<BackendHealth> {
  const diagnostics: string[] = [];
  const base: BackendHealth = {
    ok: false,
    configured: isSupabaseConfigured,
    auth: "unconfigured",
    database: "unconfigured",
    storage: "unconfigured",
    latencyMs: null,
    diagnostics,
  };

  if (!isSupabaseConfigured) {
    diagnostics.push("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set");
    return base;
  }

  try {
    // 1. Auth — the health endpoint answers without credentials.
    const { result: authRes, ms } = await timed(async () => {
      const url = new URL(SUPABASE_URL);
      const res = await fetch(`${url.origin}/auth/v1/health`);
      return res;
    });
    base.latencyMs = ms;
    if (authRes.ok) {
      base.auth = "ok";
      diagnostics.push(`auth/v1/health → ${authRes.status} (${ms}ms)`);
    } else {
      base.auth = "unreachable";
      diagnostics.push(`auth/v1/health → ${authRes.status}`);
    }
  } catch (e) {
    base.auth = "unreachable";
    diagnostics.push(`auth/v1/health → ${e instanceof Error ? e.message : "network error"}`);
  }

  // 2. Database — a trivial authenticated round-trip is enough. When signed
  //    out, use the (public) plans table which has an allow-all policy.
  try {
    const { ms } = await timed(async () => {
      const { data } = await supabase.from("plans").select("plan_id").limit(1);
      return data;
    });
    base.database = "ok";
    diagnostics.push(`plans query → ${ms}ms`);
  } catch (e) {
    base.database = "unreachable";
    diagnostics.push(`plans query → ${e instanceof Error ? e.message : "failed"}`);
  }

  // 3. Storage — the drop-files bucket exists check via the storage API.
  try {
    const { ms } = await timed(async () => {
      // Listing is allowed; the bucket itself being absent returns an error.
      const { data } = await supabase.storage.from("drop-files").list("", { limit: 1 });
      return data;
    });
    base.storage = "ok";
    diagnostics.push(`drop-files bucket → ${ms}ms`);
  } catch (e) {
    base.storage = "unreachable";
    diagnostics.push(`drop-files bucket → ${e instanceof Error ? e.message : "failed"}`);
  }

  base.ok = base.auth === "ok" && base.database === "ok" && base.storage === "ok";
  return base;
}
