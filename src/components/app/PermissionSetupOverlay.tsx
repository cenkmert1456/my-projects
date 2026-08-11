import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  getPermissionState,
  requestPermission,
  type PermissionKind,
  type PermissionState,
} from "@/lib/mobile/permissions";
import { isNative } from "@/lib/mobile/platform";
import { haptic } from "@/lib/mobile/native";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Camera, Check, FileUp, Images, Loader2, Mic, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const FLAG_KEY = "drop.permissionSetupDone";

function setupSeen(): boolean {
  try {
    return window.localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function markSetupSeen(): void {
  try {
    window.localStorage.setItem(FLAG_KEY, "1");
  } catch {
    // ignore
  }
}

interface Row {
  kind: PermissionKind;
  icon: typeof Camera;
  titleKey: string;
  descKey: string;
  /** permissions that genuinely have a runtime Allow button. */
  requestable: boolean;
}

const ROWS: Row[] = [
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

export function PermissionSetupOverlay() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [states, setStates] = useState<Partial<Record<PermissionKind, PermissionState>>>({});
  const [busyKind, setBusyKind] = useState<PermissionKind | null>(null);
  const [done, setDone] = useState(false);

  // Show once per device, after onboarding, only on native builds.
  useEffect(() => {
    if (!isNative()) return;
    if (!user || user.onboardingDone !== true) return;
    if (setupSeen()) return;
    setOpen(true);
  }, [user]);

  const refresh = useCallback(async () => {
    const next: Partial<Record<PermissionKind, PermissionState>> = {};
    for (const row of ROWS) {
      try {
        next[row.kind] = await getPermissionState(row.kind);
      } catch {
        next[row.kind] = { status: "unavailable", permanent: false };
      }
    }
    setStates(next);
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const finish = () => {
    markSetupSeen();
    setDone(true);
    haptic("success");
    window.setTimeout(() => setOpen(false), 250);
  };

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

  const grantedCount = ROWS.filter((r) => states[r.kind]?.status === "granted").length;

  return (
    <AnimatePresence>
      {open && !done && (
        <motion.div
          key="permission-setup"
          className="fixed inset-0 z-[60] flex items-end justify-center bg-background/95 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="mx-3 mb-3 flex w-full max-w-md flex-col rounded-[2rem] border border-border/70 bg-card p-6 shadow-2xl sm:mb-0"
            style={{ maxHeight: "88dvh" }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-extrabold leading-tight tracking-tight">{t("permissions.setupTitle")}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("permissions.setupSubtitle")}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={finish}
                className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                aria-label={t("common.skip")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Permission rows */}
            <div className="mt-5 space-y-2 overflow-y-auto">
              {ROWS.map((row) => {
                const state = states[row.kind];
                const granted = state?.status === "granted";
                const busy = busyKind === row.kind;
                return (
                  <div
                    key={row.kind}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border border-border/70 p-3.5 transition-colors",
                      granted && "border-emerald-500/25 bg-emerald-500/5",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        granted ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300" : "bg-primary/10 text-primary",
                      )}
                    >
                      <row.icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight">{t(row.titleKey)}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{t(row.descKey)}</p>
                    </div>
                    {granted ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-300">
                        <Check className="h-3 w-3" /> {t(STATUS_KEY.granted)}
                      </span>
                    ) : row.requestable ? (
                      <Button
                        size="sm"
                        className="h-9 shrink-0 rounded-xl px-3.5 text-xs font-semibold"
                        disabled={busy}
                        onClick={() => void allow(row.kind)}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("permissions.allow")}
                      </Button>
                    ) : (
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {t("permissions.noPermissionNeeded")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="mt-5 space-y-2">
              <Button className="h-12 w-full rounded-2xl font-semibold" onClick={finish}>
                {grantedCount >= ROWS.filter((r) => r.requestable).length
                  ? t("permissions.ready")
                  : t("permissions.continueAnyway")}
              </Button>
              <button
                type="button"
                onClick={finish}
                className="w-full cursor-pointer py-1 text-center text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {t("permissions.skipNote")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
