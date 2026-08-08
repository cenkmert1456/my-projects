// DROP native bridge — a thin, typed wrapper around Capacitor plugins.
//
// Every function here has a safe web fallback, so the exact same code paths
// run in the browser (PWA) and in the native apps. Web fallbacks degrade to
// what a browser can do (file inputs, navigator.share, navigator.vibrate, …).
//
// Nothing in this file may throw on the web — native imports are guarded by
// `isNative()` checks.

import { isAndroid, isNative } from "./platform";

export { isNative, isAndroid };

// ---------------------------------------------------------------------------
// Haptics
// ---------------------------------------------------------------------------

export type HapticKind = "light" | "medium" | "heavy" | "success" | "warning" | "error";

export async function haptic(kind: HapticKind = "light"): Promise<void> {
  try {
    if (!isNative()) {
      // Web fallback: vibration API (Android browsers), no-op elsewhere.
      if (kind === "light" || kind === "medium") navigator.vibrate?.(10);
      else if (kind === "heavy") navigator.vibrate?.(20);
      else navigator.vibrate?.([10, 30, 10]);
      return;
    }
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    switch (kind) {
      case "light":
        await Haptics.impact({ style: ImpactStyle.Light });
        break;
      case "medium":
        await Haptics.impact({ style: ImpactStyle.Medium });
        break;
      case "heavy":
        await Haptics.impact({ style: ImpactStyle.Heavy });
        break;
      case "success":
        await Haptics.notification({ type: NotificationType.Success });
        break;
      case "warning":
        await Haptics.notification({ type: NotificationType.Warning });
        break;
      case "error":
        await Haptics.notification({ type: NotificationType.Error });
        break;
    }
  } catch {
    // haptics are a nicety — never block the flow
  }
}

// ---------------------------------------------------------------------------
// Camera & photo library
// ---------------------------------------------------------------------------

export interface CapturedPhoto {
  /** base64 data URL (data:image/...) when available. */
  dataUrl?: string;
  /** local path to the picked file (native FilePicker / Camera webPath). */
  path?: string;
  format?: string;
  displayName?: string;
  /** milliseconds — when the photo was taken (where provided by the OS). */
  takenAt?: number;
}

/**
 * Open the native camera. Returns null when the user cancels.
 * Only requests the camera permission here (contextual, not at startup).
 */
export async function takePhoto(): Promise<CapturedPhoto | null> {
  if (!isNative()) {
    return pickFromInput(true);
  }
  const { Camera, CameraSource, CameraResultType } = await import("@capacitor/camera");
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.DataUrl,
      quality: 92,
      correctOrientation: true,
      saveToGallery: false,
    });
    if (!photo?.dataUrl) return null;
    return {
      dataUrl: photo.dataUrl,
      format: photo.format,
      displayName: `photo-${Date.now()}.${photo.format ?? "jpg"}`,
    };
  } catch {
    return null; // user cancelled or permission denied
  }
}

/**
 * Pick image(s) from the device library. Returns [] when cancelled.
 * `multiple` uses the native multi-select gallery (FilePicker.pickImages —
 * the Capacitor 8 camera plugin no longer exposes multi-pick).
 */
export async function pickPhotos(multiple = false): Promise<CapturedPhoto[]> {
  if (!isNative()) {
    const file = await pickFromInput(false);
    return file ? [file] : [];
  }
  try {
    const { FilePicker } = await import("@capawesome/capacitor-file-picker");
    const res = await FilePicker.pickImages({
      limit: multiple ? 0 : 1,
    });
    const files = res.files ?? [];
    return files
      .filter((f) => f.path)
      .map((f) => ({
        path: f.path as string,
        displayName: f.name,
        format: (f.mimeType ?? "image/jpeg").split("/")[1],
      }));
  } catch {
    return [];
  }
}

function pickFromInput(capture: boolean): Promise<CapturedPhoto | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (capture) input.setAttribute("capture", "environment");
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: reader.result as string, displayName: file.name });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

// ---------------------------------------------------------------------------
// Native share sheet (outgoing)
// ---------------------------------------------------------------------------

export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
  files?: string[];
  dialogTitle?: string;
}

export async function shareNative(payload: SharePayload): Promise<boolean> {
  try {
    if (!isNative()) {
      if (navigator.share) {
        await navigator.share({
          title: payload.title,
          text: payload.text,
          url: payload.url,
        });
        return true;
      }
      if (payload.url) await navigator.clipboard?.writeText(payload.url);
      if (payload.url && !payload.text) {
        window.open(payload.url, "_blank", "noopener");
      }
      return true;
    }
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title: payload.title,
      text: payload.text,
      url: payload.url,
      dialogTitle: payload.dialogTitle,
      files: payload.files,
    });
    return true;
  } catch {
    return false;
  }
}

/** Open a URL in the system browser (native) / new tab (web). */
export async function openExternal(url: string): Promise<void> {
  try {
    if (isNative()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      return;
    }
  } catch {
    // fall through to web
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

// ---------------------------------------------------------------------------
// Local notifications (reminders) + push registration
// ---------------------------------------------------------------------------

export interface LocalNotificationInput {
  id: number;
  title: string;
  body: string;
  at: number; // epoch ms
  extra?: Record<string, unknown>;
}

/**
 * Request notification permission — call only when it makes sense (e.g. the
 * user just created their first reminder), never at app startup.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (!isNative()) {
      if (!("Notification" in window)) return false;
      const perm = await Notification.requestPermission();
      return perm === "granted";
    }
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const res = await LocalNotifications.requestPermissions();
    return res.display === "granted";
  } catch {
    return false;
  }
}

export async function scheduleLocalNotification(input: LocalNotificationInput): Promise<void> {
  try {
    if (!isNative()) {
      if ("Notification" in window && Notification.permission === "granted") {
        const delay = input.at - Date.now();
        if (delay > 0 && delay < 60_000 * 60 * 24 * 30) {
          window.setTimeout(() => {
            try {
              new Notification(input.title, { body: input.body });
            } catch {
              // ignore
            }
          }, delay);
        }
      }
      return;
    }
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [
        {
          id: input.id,
          title: input.title,
          body: input.body,
          schedule: { at: new Date(input.at), allowWhileIdle: true },
          extra: input.extra,
        },
      ],
    });
  } catch {
    // notifications are additive — the backend reminder remains the source of truth
  }
}

export async function cancelLocalNotification(id: number): Promise<void> {
  try {
    if (!isNative()) return;
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {
    // ignore
  }
}

export async function getPendingLocalNotifications(): Promise<number[]> {
  try {
    if (!isNative()) return [];
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const res = await LocalNotifications.getPending();
    return (res.notifications ?? []).map((n) => n.id);
  } catch {
    return [];
  }
}

export async function registerForPushNotifications(): Promise<void> {
  try {
    if (!isNative()) return;
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.requestPermissions();
    await PushNotifications.register();
  } catch {
    // remote push is optional until Firebase is configured
  }
}

// ---------------------------------------------------------------------------
// Biometrics (app lock + locked drops)
// ---------------------------------------------------------------------------

export async function biometricsAvailable(): Promise<boolean> {
  try {
    if (!isNative()) return false;
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    const res = await BiometricAuth.checkBiometry();
    return res.isAvailable;
  } catch {
    return false;
  }
}

export async function authenticateWithBiometrics(reason: string): Promise<boolean> {
  try {
    if (!isNative()) return false;
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    // authenticate() resolves on success and REJECTS on any failure/cancel.
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: "Cancel",
      allowDeviceCredential: true,
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Secure storage (iOS Keychain / Android Keystore) with localStorage fallback
// ---------------------------------------------------------------------------

const SECURE_PREFIX = "drop.secure.";

export async function secureGet(key: string): Promise<string | null> {
  try {
    if (isNative()) {
      const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
      const value = await SecureStorage.getItem(key);
      return value;
    }
  } catch {
    // fall through to web storage
  }
  return window.localStorage?.getItem(SECURE_PREFIX + key) ?? null;
}

export async function secureSet(key: string, value: string): Promise<void> {
  try {
    if (isNative()) {
      const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
      await SecureStorage.set(key, value);
      return;
    }
  } catch {
    // fall through
  }
  window.localStorage?.setItem(SECURE_PREFIX + key, value);
}

export async function secureRemove(key: string): Promise<void> {
  try {
    if (isNative()) {
      const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
      await SecureStorage.removeItem(key);
      return;
    }
  } catch {
    // fall through
  }
  window.localStorage?.removeItem(SECURE_PREFIX + key);
}

// ---------------------------------------------------------------------------
// Status bar & keyboard
// ---------------------------------------------------------------------------

export async function setStatusBarStyle(dark: boolean): Promise<void> {
  try {
    if (!isNative()) return;
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark });
  } catch {
    // ignore
  }
}

export async function setStatusBarOverlay(overlay: boolean): Promise<void> {
  try {
    if (!isNative()) return;
    const { StatusBar } = await import("@capacitor/status-bar");
    await StatusBar.setOverlaysWebView({ overlay });
  } catch {
    // ignore
  }
}

/** Lock the app to portrait. */
export async function lockPortrait(): Promise<void> {
  try {
    if (!isNative()) return;
    const { ScreenOrientation } = await import("@capacitor/screen-orientation");
    await ScreenOrientation.lock({ orientation: "portrait" });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Deep links (incoming URLs like drop://drop/123)
// ---------------------------------------------------------------------------

export interface DeepLink {
  path: string; // e.g. "drop/123" or "collection/abc"
  query: Record<string, string>;
  /** Full original URL (includes any #fragment — used for auth callbacks). */
  raw?: string;
}

/** Parse a `drop://host/path?query#fragment` or https fallback URL into a route. */
export function parseDeepLink(url: string): DeepLink | null {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\//, "");
    const query: Record<string, string> = {};
    u.searchParams.forEach((v, k) => {
      query[k] = v;
    });
    return { path, query, raw: url };
  } catch {
    return null;
  }
}

export function registerDeepLinkListener(onOpen: (link: DeepLink) => void): () => void {
  if (!isNative()) return () => {};
  let disposed = false;
  let removeHandle: (() => void) | null = null;
  try {
    void import("@capacitor/app").then(({ App }) => {
      if (disposed) return;
      void App.addListener("appUrlOpen", (data) => {
        const parsed = parseDeepLink(data.url);
        if (parsed) onOpen(parsed);
      }).then((handle) => {
        if (disposed) handle.remove();
        else removeHandle = () => handle.remove();
      });
    });
  } catch {
    // ignore
  }
  return () => {
    disposed = true;
    removeHandle?.();
  };
}

// ---------------------------------------------------------------------------
// Incoming share (Android native intent → web). The native IncomingSharePlugin
// fires a `drop:incoming-share` DOM event and caches the payload for cold
// starts; we also poll it once on startup.
// ---------------------------------------------------------------------------

export interface IncomingShare {
  text?: string;
  subject?: string;
  type?: string;
  uris?: string[];
  /** base64 data URLs of shared files (resolved natively on Android). */
  dataUrls?: string[];
}

export function registerIncomingShareListener(onShare: (share: IncomingShare) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as IncomingShare | undefined;
    if (detail && (detail.text || detail.uris?.length || detail.dataUrls?.length)) onShare(detail);
  };
  window.addEventListener("drop:incoming-share", handler);
  return () => window.removeEventListener("drop:incoming-share", handler);
}

/** Poll the native plugin once for a cold-start shared payload (Android). */
export async function pollIncomingShare(): Promise<IncomingShare | null> {
  try {
    if (!isNative() || !isAndroid()) return null;
    const { Capacitor } = await import("@capacitor/core");
    const plugin = (Capacitor as unknown as { Plugins: Record<string, { getPendingShare: () => Promise<IncomingShare> }> }).Plugins?.IncomingShare;
    if (!plugin) return null;
    const res = await plugin.getPendingShare();
    if (res && (res.text || res.uris?.length || res.dataUrls?.length)) return res;
    return null;
  } catch {
    return null;
  }
}
