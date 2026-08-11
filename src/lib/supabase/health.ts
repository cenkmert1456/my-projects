/**
 * Backend connectivity health check.
 *
 * The app needs to know — internally — whether Supabase (auth + database +
 * storage) is reachable and correctly configured, without exposing scary
 * technical diagnostics to ordinary users. `checkBackendHealth()` returns a
 * simple summary plus an optional developer-only detail list.
 */

import { supabase, isSupabaseConfigured } from "./client";
import { Capacitor } from "@capacitor/core";

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

export async function checkBackendHealth(userId?: string | null): Promise<BackendHealth> {
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

  // Signed-in device diagnostics (Part U) — exact queries the screens run, so
  // a "Your memory couldn't load" screen can be traced to the real cause.
  if (userId) {
    try {
      const { data: profile, error: pe } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("id", userId)
        .maybeSingle();
      diagnostics.push(pe ? `profile query → ${pe.message}` : profile ? `profile query → ok (${profile.name ?? "no name"})` : "profile query → no row");
    } catch (e) {
      diagnostics.push(`profile query → ${e instanceof Error ? e.message : "failed"}`);
    }
    try {
      const { data, error: de } = await supabase.from("drops").select("id").eq("user_id", userId).limit(1);
      diagnostics.push(de ? `drops query → ${de.message}` : `drops query → ok (${(data ?? []).length} sample)`);
    } catch (e) {
      diagnostics.push(`drops query → ${e instanceof Error ? e.message : "failed"}`);
    }
    try {
      const { data, error: se } = await supabase.from("search_history").select("id").eq("user_id", userId).limit(1);
      diagnostics.push(se ? `search_history query → ${se.message}` : `search_history query → ok (${(data ?? []).length} sample)`);
    } catch (e) {
      diagnostics.push(`search_history query → ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  // Native plugin availability — a missing native implementation surfaces
  // here instead of failing capture flows silently.
  try {
    if (typeof Capacitor !== "undefined" && Capacitor.isNativePlatform()) {
      const plugs = (Capacitor as unknown as { Plugins: Record<string, unknown> }).Plugins ?? {};
      const present: string[] = [];
      for (const name of ["Camera", "FilePicker", "LocalNotifications", "DropPermissions", "IncomingShare", "Haptics", "Network", "App"]) {
        if (plugs[name]) present.push(name);
      }
      diagnostics.push(`native plugins → ${present.join(", ") || "none found"}`);
    }
  } catch {
    // ignore
  }

  return base;
}
