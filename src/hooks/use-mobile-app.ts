// useMobileApp — one hook that wires every native capability into the app:
//
//   - deep links (drop://drop/123 → navigate to the Drop)
//   - incoming shares (Android share intents → open capture preview)
//   - offline / online detection (subtle banner + upload queue flush)
//   - app resume → refresh relevant state
//   - status bar theme + portrait lock (native)
//   - app lock (biometrics after inactivity)

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTheme } from "next-themes";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import {
  isNative,
  parseDeepLink,
  pollIncomingShare,
  registerDeepLinkListener,
  registerIncomingShareListener,
  setStatusBarStyle,
  lockPortrait,
  type IncomingShare,
} from "@/lib/mobile/native";
import {
  appLockEnabled,
  loadAppLockSettings,
  markActive,
  shouldLockNow,
  tryUnlock,
} from "@/lib/mobile/app-lock";
import { listQueued, queuedCount, removeQueued } from "@/lib/mobile/upload-queue";
import { useAuth } from "@/hooks/use-auth";

export interface IncomingSharePayload {
  text?: string;
  url?: string;
  uris?: string[];
  imageDataUrl?: string;
  fileName?: string;
  contentType?: string;
}

export function useMobileApp() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const { isAuthenticated } = useAuth();
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [locked, setLocked] = useState(false);
  // Bumped when the app resumes — components that key on it re-fetch.
  const [refreshKey, setRefreshKey] = useState(0);
  const create = useMutation(api.drops.create);
  const generateUploadUrl = useMutation(api.drops.generateUploadUrl);

  // Boot: load app-lock settings, lock portrait, apply status bar style.
  useEffect(() => {
    void loadAppLockSettings();
    void lockPortrait();
    void markActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Status bar follows the theme.
  useEffect(() => {
    void setStatusBarStyle(resolvedTheme !== "light");
  }, [resolvedTheme]);

  // Online/offline detection (browser events work everywhere).
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Flush queued captures when connectivity returns and the user is authed.
  useEffect(() => {
    if (!online || !isAuthenticated) return;
    if (queuedCount() === 0) return;
    const flush = async () => {
      for (const item of listQueued()) {
        try {
          if (item.kind === "link" && item.url) {
            await create({ kind: "link", url: item.url, saveAnyway: true });
            removeQueued(item.id);
            continue;
          }
          if (item.kind === "note" && item.text) {
            await create({ kind: "note", text: item.text });
            removeQueued(item.id);
            continue;
          }
          if (item.payload && (item.kind === "image" || item.kind === "screenshot" || item.kind === "document")) {
            const url = await generateUploadUrl();
            const bytes = atob(item.payload.split(",")[1] ?? "");
            const arr = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
            const blob = new Blob([arr], { type: item.contentType ?? "image/jpeg" });
            const res = await fetch(url, {
              method: "PUT",
              headers: { "Content-Type": item.contentType ?? "image/jpeg" },
              body: blob,
            });
            if (!res.ok) continue;
            const storageId = url.split("/").pop() ?? "";
            await create({
              kind: item.kind === "document" ? "document" : "screenshot",
              storageId,
              contentType: item.contentType,
              fileName: item.fileName,
            });
            removeQueued(item.id);
          }
        } catch {
          // keep the item queued — retry on next reconnect
        }
      }
    };
    void flush();
  }, [online, isAuthenticated, create, generateUploadUrl]);

  // Deep links: drop://drop/123, drop://collection/abc
  useEffect(() => {
    const onDeepLink = (link: { path: string; query: Record<string, string> }) => {
      void markActive();
      const [first, second] = link.path.split("/");
      if (first === "drop" && second) navigate(`/app/drop/${second}`);
      else if (first === "collection" && second) navigate(`/app/collections/${second}`);
      else if (first === "ask") navigate("/app/ask");
      else if (first === "search") navigate("/app/search");
      else navigate("/app");
    };
    return registerDeepLinkListener(onDeepLink);
  }, [navigate]);

  // Incoming share (Android): notify the app so it can open the capture preview.
  useEffect(() => {
    if (!isNative()) return;
    const onShare = (share: IncomingShare) => {
      void markActive();
      const text = share.text ?? share.subject;
      const url = text?.match(/https?:\/\/\S+/i)?.[0] ?? undefined;
      const payload: IncomingSharePayload = {
        text: text && text !== url ? text : undefined,
        url,
        uris: share.uris,
        imageDataUrl: share.dataUrls?.[0],
        contentType: share.type,
      };
      if (isAuthenticated) {
        window.dispatchEvent(new CustomEvent("drop:open-incoming-share", { detail: payload }));
      }
    };
    const dispose = registerIncomingShareListener(onShare);
    void pollIncomingShare().then((share) => {
      if (share) onShare(share);
    });
    return dispose;
  }, [isAuthenticated]);

  // App resume: check app lock + bump the refresh key so mounted screens
  // re-subscribe to fresh data (Convex queries re-run on re-render).
  useEffect(() => {
    if (!isNative()) return;
    let disposed = false;
    void import("@capacitor/app").then(({ App }) => {
      if (disposed) return;
      void App.addListener("appStateChange", (state) => {
        if (state.isActive) {
          void markActive();
          setRefreshKey((k) => k + 1);
          if (appLockEnabled() && shouldLockNow()) {
            setLocked(true);
          }
        } else {
          void markActive();
          setLocked(false);
        }
      });
    });
    return () => {
      disposed = true;
    };
  }, []);

  // Local notification tap → open the relevant Drop (deep link behaviour).
  useEffect(() => {
    if (!isNative()) return;
    let disposed = false;
    void import("@capacitor/local-notifications").then(({ LocalNotifications }) => {
      if (disposed) return;
      void LocalNotifications.addListener(
        "localNotificationActionPerformed",
        (res) => {
          const dropId = res.notification.extra?.dropId as string | undefined;
          if (dropId) navigate(`/app/drop/${dropId}`);
          else void markActive();
        },
      );
    });
    return () => {
      disposed = true;
    };
  }, [navigate]);

  // User interaction resets the app-lock inactivity clock.
  useEffect(() => {
    const onAny = () => void markActive();
    window.addEventListener("pointerdown", onAny);
    window.addEventListener("keydown", onAny);
    return () => {
      window.removeEventListener("pointerdown", onAny);
      window.removeEventListener("keydown", onAny);
    };
  }, []);

  // Unlock flow.
  const requestUnlock = async (): Promise<boolean> => {
    const ok = await tryUnlock("Unlock DROP");
    if (ok) setLocked(false);
    return ok;
  };

  return {
    online,
    locked,
    setLocked,
    refreshKey,
    requestUnlock,
  };
}
