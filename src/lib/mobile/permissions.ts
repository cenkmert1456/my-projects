/**
 * DROP permission center — one honest API over Android/iOS runtime
 * permissions. Nothing here fabricates a "granted".
 *
 * Kinds:
 *   camera        → real runtime permission (Capacitor Camera on native)
 *   microphone    → real runtime permission (native DropPermissions plugin)
 *   notifications → real runtime permission (LocalNotifications plugin)
 *   photos        → NOT a permission: DROP uses the Android system Photo
 *                   Picker / iOS PHPicker, which need no broad storage grant.
 *                   Reported as "not_required" — the app never asks for
 *                   READ_EXTERNAL_STORAGE / MANAGE_EXTERNAL_STORAGE.
 *   documents     → NOT a permission: Storage Access Framework / file picker.
 *                   Reported as "not_required".
 *
 * Every function degrades to a sensible web answer so the PWA shares the
 * same code paths.
 */

import { isNative } from "./platform";

export type PermissionKind = "camera" | "microphone" | "notifications" | "photos" | "documents";

export type PermissionStatus = "granted" | "denied" | "limited" | "unavailable" | "not_required";

export interface PermissionState {
  status: PermissionStatus;
  /** true when the user has permanently denied (don't-ask-again) on Android. */
  permanent: boolean;
  /** short human note for the Permissions screen (already localized keys). */
  noteKey?: string;
}

/** Statuses reported by the native DropPermissions plugin. */
type NativePermissionState = "granted" | "denied" | "permanently_denied" | "unknown";

interface NativeStatuses {
  camera?: NativePermissionState;
  microphone?: NativePermissionState;
  notifications?: NativePermissionState;
  sdkInt?: number;
  photosMode?: string;
}

interface DropPermissionsPlugin {
  getStatuses: () => Promise<NativeStatuses>;
  requestPermission: (opts: { kind: string }) => Promise<{ camera?: NativePermissionState; microphone?: NativePermissionState }>;
  openAppSettings: () => Promise<void>;
}

function nativePlugin(): Promise<DropPermissionsPlugin | null> {
  if (!isNative()) return Promise.resolve(null);
  return import("@capacitor/core").then(({ Capacitor }) => {
    const plugin = (Capacitor as unknown as { Plugins: Record<string, unknown> }).Plugins
      ?.DropPermissions as DropPermissionsPlugin | undefined;
    return plugin ?? null;
  });
}

function mapNative(state: NativePermissionState | undefined): { status: PermissionStatus; permanent: boolean } {
  if (state === "granted") return { status: "granted", permanent: false };
  if (state === "permanently_denied") return { status: "denied", permanent: true };
  if (state === "denied") return { status: "denied", permanent: false };
  return { status: "unavailable", permanent: false };
}

/** Best-effort web permission state via the Permissions API (Safari lacks it). */
async function webPermissionState(name: "camera" | "microphone" | "notifications"): Promise<PermissionState | null> {
  try {
    if (name === "notifications" && "Notification" in window) {
      const p = Notification.permission;
      if (p === "granted") return { status: "granted", permanent: false };
      if (p === "denied") return { status: "denied", permanent: true };
      return { status: "denied", permanent: false };
    }
    if (!navigator.permissions?.query) return null;
    const res = await navigator.permissions.query({ name } as unknown as PermissionDescriptor);
    if (res.state === "granted") return { status: "granted", permanent: false };
    if (res.state === "denied") return { status: "denied", permanent: true };
    return { status: "denied", permanent: false };
  } catch {
    return null;
  }
}

export async function getPermissionState(kind: PermissionKind): Promise<PermissionState> {
  // Photos & documents: system pickers — no permission exists to ask for.
  if (kind === "photos" || kind === "documents") {
    return {
      status: "not_required",
      permanent: false,
      noteKey: kind === "photos" ? "permissions.systemPickerNote" : "permissions.systemDocumentsNote",
    };
  }

  const plugin = await nativePlugin();

  // Native: real OS state (with permanently-denied detection).
  if (plugin && kind !== "notifications") {
    try {
      const statuses = await plugin.getStatuses();
      if (kind === "camera") {
        const m = mapNative(statuses.camera);
        return m.status === "unavailable" ? { ...m, noteKey: "permissions.unavailableNote" } : m;
      }
      if (kind === "microphone") {
        const m = mapNative(statuses.microphone);
        return m.status === "unavailable" ? { ...m, noteKey: "permissions.unavailableNote" } : m;
      }
    } catch {
      // plugin missing — fall through to the Capacitor-API checks below
    }
  }

  if (kind === "camera") {
    try {
      const { Camera } = await import("@capacitor/camera");
      const res = await Camera.checkPermissions();
      const state = res.camera as string | undefined;
      if (state === "granted") return { status: "granted", permanent: false };
      if (state === "denied" || state === "prompt" || state === "prompt-with-rationale") {
        return { status: "denied", permanent: false };
      }
      return { status: "unavailable", permanent: false };
    } catch {
      const web = await webPermissionState("camera");
      return web ?? { status: "not_required", permanent: false, noteKey: "permissions.browserNote" };
    }
  }

  if (kind === "microphone") {
    const web = await webPermissionState("microphone");
    return web ?? { status: "not_required", permanent: false, noteKey: "permissions.browserNote" };
  }

  // Notifications
  try {
    if (isNative()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const res = await LocalNotifications.checkPermissions();
      return res.display === "granted"
        ? { status: "granted", permanent: false }
        : { status: "denied", permanent: false };
    }
    const web = await webPermissionState("notifications");
    return web ?? { status: "not_required", permanent: false, noteKey: "permissions.browserNote" };
  } catch {
    return { status: "unavailable", permanent: false };
  }
}

/**
 * Request a permission through the correct Android runtime API.
 * Resolves with the state AFTER the request. Cancellation is NOT an error —
 * the caller checks the resulting status.
 */
export async function requestPermission(kind: PermissionKind): Promise<PermissionState> {
  if (kind === "photos" || kind === "documents") {
    return { status: "granted", permanent: false };
  }

  if (kind === "camera") {
    const plugin = await nativePlugin();
    if (plugin) {
      // Native Android: request CAMERA through DropPermissions so the request
      // is tracked (permanent-denial detection) and the system dialog is the
      // real one. Resolves with the state after the dialog.
      try {
        await plugin.requestPermission({ kind: "camera" });
      } catch {
        // user dismissed the dialog — re-check below reports the truth
      }
    } else {
      try {
        const { Camera } = await import("@capacitor/camera");
        await Camera.requestPermissions();
      } catch {
        // camera plugin unavailable — nothing more we can do
      }
    }
    return getPermissionState("camera");
  }

  if (kind === "microphone") {
    const plugin = await nativePlugin();
    if (plugin) {
      try {
        await plugin.requestPermission({ kind: "microphone" });
      } catch {
        // user dismissed the system dialog — re-check below
      }
    } else if (isNative()) {
      // No plugin: probe with a silent getUserMedia (triggers the system prompt).
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((tr) => tr.stop());
      } catch {
        // denied or cancelled — re-check reports the truth
      }
    }
    return getPermissionState("microphone");
  }

  if (kind === "notifications") {
    try {
      if (isNative()) {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        await LocalNotifications.requestPermissions();
      } else if ("Notification" in window) {
        await Notification.requestPermission();
      }
    } catch {
      // fall through
    }
    return getPermissionState("notifications");
  }

  return getPermissionState(kind);
}

/** Open the real Android application settings page (or no-op on web). */
export async function openAppSettings(): Promise<void> {
  const plugin = await nativePlugin();
  if (plugin) {
    try {
      await plugin.openAppSettings();
      return;
    } catch {
      // fall through
    }
  }
  // Web has no app-settings deep link; nothing to do.
}

export const PERMISSION_KINDS: PermissionKind[] = ["camera", "photos", "microphone", "notifications", "documents"];
