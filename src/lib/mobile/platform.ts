// Safe Capacitor platform detection.
//
// DROP runs in three environments from one codebase:
//   1. Web (browser / PWA)
//   2. Android (Capacitor WebView)
//   3. iOS (Capacitor WebView)
//
// All Capacitor imports go through this module and are guarded so the web
// build never tries to load native plugins (they are not installed there).

import { Capacitor } from "@capacitor/core";

export const isNative = (): boolean => Capacitor.isNativePlatform();

/** True when running inside the Capacitor Android app. */
export const isAndroid = (): boolean => isNative() && Capacitor.getPlatform() === "android";

/** True when running inside the Capacitor iOS app. */
export const isIOS = (): boolean => isNative() && Capacitor.getPlatform() === "ios";

export const platformName = (): string =>
  isNative() ? Capacitor.getPlatform() : "web";

/** Current online state — works in native (Network plugin) and web. */
export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}
