import { Preferences } from "@capacitor/preferences";
import type { SupportedStorage } from "@supabase/supabase-js";

/**
 * Supabase Auth storage adapter.
 *
 * supabase-js expects a synchronous `getItem/setItem/removeItem` interface.
 * On native (Capacitor) we persist sessions through @capacitor/preferences
 * (Android SharedPreferences / iOS UserDefaults) so the login survives app
 * restarts; on the web we fall back to localStorage.
 *
 * The Preferences API is asynchronous, so the adapter keeps an in-memory
 * mirror loaded at boot and writes through in the background — reads stay
 * synchronous and correct after the initial load.
 */

function isNative(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as Record<string, unknown>).Capacitor !== "undefined"
  );
}

class CapacitorPreferencesAdapter implements SupportedStorage {
  private cache = new Map<string, string | null>();

  constructor() {
    void this.hydrate();
  }

  private async hydrate() {
    try {
      const { keys } = await Preferences.keys();
      const pairs = await Promise.all(
        keys.map(async (k) => {
          const { value } = await Preferences.get({ key: k });
          return [k, value] as const;
        }),
      );
      for (const [k, v] of pairs) this.cache.set(k, v);
    } catch {
      // non-fatal; session restore will just not find anything
    }
  }

  getItem(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.cache.set(key, value);
    void Preferences.set({ key, value });
  }

  removeItem(key: string): void {
    this.cache.delete(key);
    void Preferences.remove({ key });
  }
}

class LocalStorageAdapter implements SupportedStorage {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // quota / privacy mode — ignore
    }
  }

  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

export const supabaseStorageAdapter: SupportedStorage = isNative()
  ? new CapacitorPreferencesAdapter()
  : new LocalStorageAdapter();
