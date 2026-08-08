// Optional App Lock (Face ID / Touch ID / Android biometrics).
//
// When enabled, DROP asks for biometrics after the app has been backgrounded
// longer than the configured delay. Falls back to re-authenticating via the
// normal sign-in flow if biometrics are unavailable (users are never locked
// out permanently).
//
// Settings persist in secure storage (Keychain/Keystore) when native,
// localStorage on the web.

import { authenticateWithBiometrics, biometricsAvailable } from "./native";

export type LockDelay = "immediate" | "1m" | "5m" | "15m";

const SETTING_KEY = "appLockEnabled";
const DELAY_KEY = "appLockDelay";

let lastActiveAt = Date.now();
let enabled = false;
let delayMs = 0;

export async function loadAppLockSettings(): Promise<void> {
  try {
    const { secureGet } = await import("./native");
    const [e, d] = await Promise.all([secureGet(SETTING_KEY), secureGet(DELAY_KEY)]);
    enabled = e === "1";
    delayMs = parseDelay(d);
  } catch {
    // defaults
  }
}

export function appLockEnabled(): boolean {
  return enabled;
}

export function appLockDelayMs(): number {
  return delayMs;
}

export async function setAppLockEnabled(value: boolean): Promise<void> {
  enabled = value;
  const { secureSet, secureRemove } = await import("./native");
  if (value) await secureSet(SETTING_KEY, "1");
  else await secureRemove(SETTING_KEY);
  if (value) lastActiveAt = Date.now();
}

export async function setAppLockDelay(value: LockDelay): Promise<void> {
  delayMs = parseDelay(value);
  const { secureSet } = await import("./native");
  await secureSet(DELAY_KEY, value);
}

function parseDelay(value?: string | null): number {
  switch (value) {
    case "1m":
      return 60_000;
    case "5m":
      return 5 * 60_000;
    case "15m":
      return 15 * 60_000;
    default:
      return 0; // immediate
  }
}

/** Called on user interaction / foreground — resets the inactivity clock. */
export function markActive(): void {
  lastActiveAt = Date.now();
}

/**
 * Returns true when the app should ask for biometrics right now.
 * (Enough time has passed since the app went quiet.)
 */
export function shouldLockNow(): boolean {
  if (!enabled) return false;
  return Date.now() - lastActiveAt >= delayMs;
}

/** Try to unlock with biometrics. */
export async function tryUnlock(reason = "Unlock DROP"): Promise<boolean> {
  const available = await biometricsAvailable();
  if (!available) {
    // No biometric hardware/enrollment → the user re-auths via normal sign-in.
    return false;
  }
  return authenticateWithBiometrics(reason);
}
