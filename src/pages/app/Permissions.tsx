import { Button } from "@/components/ui/button";
import {
  getPermissionState,
  openAppSettings,
  requestPermission,
  PERMISSION_KINDS,
  type PermissionKind,
  type PermissionState,
} from "@/lib/mobile/permissions";
import { isNative } from "@/lib/mobile/platform";
import { haptic } from "@/lib/mobile/native";
import { Bell, Camera, Check, ExternalLink, FileUp, Images, Loader2, Mic, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const ROWS: Array<{ kind: PermissionKind; icon: typeof Camera; titleKey: string; descKey: string; requestable: boolean }> = [
  { kind: "camera", icon: Camera, titleKey: "permissions.camera", descKey: "permissions.cameraDesc", requestable: true },
  { kind: "photos", icon: Images, titleKey: "permissions.photos", descKey: "permissions.photosDesc", requestable: false },
  { kind: "microphone", icon: Mic, titleKey: "permissions.microphone", descKey: "permissions.microphoneDesc", requestable: true },
  { kind: "notifications", icon: Bell, titleKey: "permissions.notifications", descKey: "permissions.notificationsDesc", requestable: true },
  { kind: "documents", icon: FileUp, titleKey: "permissions.documents", descKey: "permissions.documentsDesc", requestable: false },
];

const STATUS_KEY: Record<string, string> = {
  granted: "permissions.allowed",
  denied: "permissions.notAllowed",
  limited: "permissions.limited",
  unavailable: "permissions.unavailable",
  not_required: "permissions.notRequired",
};

export default function Permissions() {
  const { t } = useTranslation();
  const [states, setStates] = useState<Partial<Record<PermissionKind, PermissionState>>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [busyKind, setBusyKind] = useState<PermissionKind | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const next: Partial<Record<PermissionKind, PermissionState>> = {};
    for (const kind of PERMISSION_KINDS) {
      try {
        next[kind] = await getPermissionState(kind);
      } catch {
        next[kind] = { status: "unavailable", permanent: false };
      }
    }
    setStates(next);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void refresh();
    // Refresh whenever the app returns from Android Settings — the OS may
    // have changed permissions while DROP was backgrounded.
    if (!isNative()) return;
    let disposed = false;
    void import("@capacitor/app").then(({ App }) => {
      if (disposed) return;
      void App.addListener("appStateChange", (state) => {
        if (state.isActive) void refresh();
      });
    });
    return () => {
      disposed = true;
    };
  }, [refresh]);

  const allow = async (kind: PermissionKind) => {
    if (busyKind) return;
    setBusyKind(kind);
    try {
      const state = await requestPermission(kind);
      setStates((s) => ({ ...s, [kind]: state }));
      haptic(state.status === "granted" ? "success" : "light");
    } finally {
      setBusyKind(null);
    }
  };

  const anyDenied = ROWS.some((r) => {
    const s = states[r.kind];
    return s && (s.status === "denied" || s.status === "limited");
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("permissions.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("permissions.subtitle")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5 rounded-xl text-xs"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          {t("permissions.refreshStatus")}
        </Button>
      </div>

      {/* Status list */}
      <div className="space-y-2">
        {ROWS.map((row) => {
          const state = states[row.kind];
          const granted = state?.status === "granted";
          const denied = state?.status === "denied" || state?.status === "limited";
          const permanent = state?.permanent === true;
          const busy = busyKind === row.kind;
          return (
            <div
              key={row.kind}
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4",
                granted && "border-emerald-500/20 bg-emerald-500/[0.04]",
                denied && "border-amber-500/25 bg-amber-500/[0.04]",
              )}
            >
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                  granted
                    ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
                    : denied
                      ? "bg-amber-500/12 text-amber-600 dark:text-amber-300"
                      : "bg-primary/10 text-primary",
                )}
              >
                {granted ? (
                  <ShieldCheck className="h-5 w-5" />
                ) : denied ? (
                  <ShieldAlert className="h-5 w-5" />
                ) : (
                  <row.icon className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">{t(row.titleKey)}</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{t(row.descKey)}</p>
                {permanent && <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">{t("permissions.permanentlyDenied")}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-bold",
                    granted
                      ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
                      : denied
                        ? "bg-amber-500/12 text-amber-600 dark:text-amber-300"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {state ? t(STATUS_KEY[state.status] ?? STATUS_KEY.unavailable) : "—"}
                </span>
                {state?.status === "not_required" ? (
                  <span className="text-[10px] text-muted-foreground">{t("permissions.noPermissionNeeded")}</span>
                ) : granted ? (
                  <span className="text-[10px] text-muted-foreground">{t("permissions.allowedShort")}</span>
                ) : row.requestable ? (
                  <Button size="sm" className="h-8 rounded-xl px-3 text-xs font-semibold" disabled={busy} onClick={() => void allow(row.kind)}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("permissions.allowAgain")}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Open settings */}
      {anyDenied && (
        <Button
          variant="outline"
          className="h-12 w-full gap-2 rounded-2xl font-semibold"
          onClick={() => void openAppSettings()}
        >
          <ExternalLink className="h-4 w-4" />
          {t("permissions.openSettings")}
        </Button>
      )}

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {isNative() ? t("permissions.settingsNote") : t("permissions.webNote")}
      </p>
    </div>
  );
}
