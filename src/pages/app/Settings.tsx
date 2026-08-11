import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { profileService } from "@/lib/services";
import { checkWebAI, type WebAIHealth } from "@/lib/ai-health";
import { checkBackendHealth, type BackendHealth } from "@/lib/supabase/health";
import {
  CalendarClock,
  Camera,
  Check,
  ChevronDown,
  Cpu,
  Database,
  Download,
  Globe,
  HardDrive,
  Loader2,
  Lock,
  Mic,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Sun,
  Trash2,
  Wifi,
  Zap,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, setAppLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { isNative } from "@/lib/mobile/platform";
import { biometricsAvailable } from "@/lib/mobile/native";
import { setAppLockDelay, setAppLockEnabled, type LockDelay } from "@/lib/mobile/app-lock";
import { useDropAI } from "@/lib/drop-ai";
import { getPermissionState, type PermissionKind } from "@/lib/mobile/permissions";
import { storageService } from "@/lib/services/storage";
import { Bell, ChevronRight, Shield as ShieldIcon } from "lucide-react";

export default function Settings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const { resolvedTheme, theme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const navigate = useNavigate();
  const [health, setHealth] = useState<WebAIHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [appLockOn, setAppLockOn] = useState(false);
  const [lockDelay, setLockDelay] = useState<LockDelay>("immediate");
  const [biometricOk, setBiometricOk] = useState(false);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [storageBytes, setStorageBytes] = useState<number | null>(null);
  const [backend, setBackend] = useState<BackendHealth | null>(null);

  const runHealthCheck = async () => {
    setChecking(true);
    try {
      const res = await checkWebAI();
      setHealth(res);
    } catch {
      setHealth({
        ok: false,
        provider: "unknown",
        label: "Health check failed",
        local: false,
        error: "Couldn't determine the AI engine state. Try again in a moment.",
      });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void runHealthCheck();
    void checkBackendHealth(uid).then(setBackend);
    void (async () => {
      const { appLockEnabled, loadAppLockSettings } = await import("@/lib/mobile/app-lock");
      await loadAppLockSettings();
      setAppLockOn(appLockEnabled());
      setBiometricOk(await biometricsAvailable());
      const { secureGet } = await import("@/lib/mobile/native");
      setWifiOnly((await secureGet("wifiOnlyUploads")) === "1");
      setLockDelay(((await secureGet("appLockDelay")) as LockDelay | null) ?? "immediate");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = async () => {
    if (!uid || exporting) return;
    setExporting(true);
    try {
      const payload = await profileService.exportData(uid);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `drop-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Your data is downloading");
    } catch {
      toast("Couldn't export your data — try again");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("common.settings")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your memory, your rules.
        </p>
      </div>

      {/* DROP Intelligence */}
      <DropIntelligenceSection
        health={health}
        checking={checking}
        onRecheck={() => void runHealthCheck()}
        wifiOnly={wifiOnly}
        onWifiOnlyChange={async (v) => {
          setWifiOnly(v);
          const { getDropAI } = await import("@/lib/drop-ai");
          const engine = await getDropAI();
          await engine.setPolicy({ wifiOnly: v });
          const { secureSet } = await import("@/lib/mobile/native");
          await secureSet("wifiOnlyUploads", v ? "1" : "0");
          toast(v ? "Large AI downloads will wait for Wi-Fi" : "AI downloads can use mobile data");
        }}
        storageBytes={storageBytes}
        onRefreshStorage={async () => {
          const { getDropAI } = await import("@/lib/drop-ai");
          const engine = await getDropAI();
          const info = await engine.getStorageInfo();
          setStorageBytes(info?.sizeBytes ?? null);
        }}
      />

      {/* Backend & sync */}
      <BackendStatusSection health={backend} onRecheck={() => void checkBackendHealth(uid).then(setBackend)} />

      {/* Permissions — real status, managed from the dedicated screen */}
      <PermissionsSection />

      {/* Notifications */}
      <NotificationsSection />

      {/* Privacy */}
      <section className="space-y-1 rounded-3xl border border-border/80 bg-card p-2">
        <div className="px-3 pb-1 pt-2">
          <h2 className="flex items-center gap-2 font-bold tracking-tight">
            <Shield className="h-4 w-4 text-primary" /> Privacy center
          </h2>
        </div>
        <SettingRow icon={Lock} title="Private by default" desc="Every Drop starts private. Sharing is always your choice.">
          <Lock className="h-4 w-4 text-emerald-500" />
        </SettingRow>
        <SettingRow
          icon={Cpu}
          title="AI processing"
          desc={isNative() ? "Runs on this device — nothing leaves your phone" : "Built-in engine in DROP's secure backend"}
        >
          <span className="rounded-xl bg-emerald-500/12 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-300">
            On device
          </span>
        </SettingRow>
        <SettingRow icon={Search} title="Search history" desc="Save my searches to make repeat lookups faster">
          <Switch
            defaultChecked={user?.searchHistoryEnabled !== false}
            onCheckedChange={(v) => void profileService.updateProfile(uid as string, { searchHistoryEnabled: v })}
          />
        </SettingRow>
        <p className="px-3 pb-3 pt-1 text-xs leading-relaxed text-muted-foreground">
          Screenshots you save are synchronized to your DROP account so they're
          available on every device. AI understanding (OCR, categorization,
          search vectors) runs on-device and never goes to a third-party AI
          provider.
        </p>
      </section>

      {/* Appearance */}
      <section className="space-y-4 rounded-3xl border border-border/80 bg-card p-5">
        <div className="flex items-center gap-2">
          <Sun className="h-5 w-5 text-primary" />
          <h2 className="font-bold tracking-tight">{t("profile.appearance")}</h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: "light", label: t("profile.lightMode"), icon: Sun },
            { id: "dark", label: t("profile.darkMode"), icon: Moon },
            { id: "system", label: t("profile.system"), icon: Monitor },
          ].map(({ id, label, icon: Icon }) => {
            const active = id === "system" ? theme === "system" : (id === "dark") === dark;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTheme(id);
                  void profileService.updateProfile(uid as string, { theme: id });
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border p-4 transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-muted/30 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-semibold">{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Language */}
      <LanguageSection uid={uid} />

      {/* Capture & search */}
      <section className="space-y-1 rounded-3xl border border-border/80 bg-card p-2">
        <div className="px-3 pb-1 pt-2">
          <h2 className="flex items-center gap-2 font-bold tracking-tight">
            <Zap className="h-4 w-4 text-primary" /> Capture & recall
          </h2>
        </div>
        <SettingRow icon={Sparkles} title="Daily recall" desc="Occasionally resurface forgotten Drops on Home">
          <Switch
            defaultChecked={user?.dailyRecallEnabled !== false}
            onCheckedChange={(v) => void profileService.updateProfile(uid as string, { dailyRecallEnabled: v })}
          />
        </SettingRow>
        <SettingRow icon={Search} title="Search history" desc="Save my searches to make repeat lookups faster">
          <Switch
            defaultChecked={user?.searchHistoryEnabled !== false}
            onCheckedChange={(v) => void profileService.updateProfile(uid as string, { searchHistoryEnabled: v })}
          />
        </SettingRow>
      </section>

      {/* Data & storage */}
      <section className="space-y-3 rounded-3xl border border-border/80 bg-card p-5">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-primary" />
          <h2 className="font-bold tracking-tight">Data & storage</h2>
        </div>
        <StorageUsageRow uid={uid} />
        <Button
          variant="outline"
          className="w-full justify-start gap-2.5 rounded-2xl"
          onClick={() => void handleExport()}
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export my data (JSON)
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Your export includes every Drop's metadata, notes, collections, reminders
          and search history. Files are stored in DROP's secure cloud and deleted
          when you delete them.
        </p>
      </section>

      {/* Danger zone */}
      <section className="rounded-3xl border border-destructive/20 bg-destructive/5 p-5">
        <div className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-destructive" />
          <h2 className="text-sm font-bold tracking-tight text-destructive">Danger zone</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Deleting your account removes all Drops, files, collections and reminders
          permanently. You can export first.
        </p>
        <Button
          variant="outline"
          className="mt-3 gap-2 rounded-2xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => navigate("/app/profile")}
        >
          <Trash2 className="h-4 w-4" /> Delete account
        </Button>
      </section>
    </div>
  );
}

/**
 * Language — the full DROP language list in native names. Changing applies
 * instantly app-wide (no restart) and syncs to the profile.
 */
function LanguageSection({ uid }: { uid: string | null }) {
  const { i18n, t } = useTranslation();
  const current = i18n.language;
  return (
    <section className="space-y-4 rounded-3xl border border-border/80 bg-card p-5">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-primary" />
        <h2 className="font-bold tracking-tight">{t("profile.language")}</h2>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const active = current === lang.code || current.startsWith(lang.code + "-");
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => {
                setAppLanguage(lang.code);
                if (uid) void profileService.updateProfile(uid, { locale: lang.code });
              }}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-muted/20 text-muted-foreground hover:border-primary/30 hover:text-foreground",
              )}
            >
              <span className="truncate">{t(`languages.${lang.code}`)}</span>
              {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Backend & sync — friendly connectivity status. Ordinary users only ever
 * see "Connected" / "Offline"; developers can expand Advanced for details.
 */
function BackendStatusSection({
  health,
  onRecheck,
}: {
  health: BackendHealth | null;
  onRecheck: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const checking = health === null;

  const connected = health?.ok === true;
  const partially = health?.configured && !connected;

  return (
    <section className="space-y-3 rounded-3xl border border-border/80 bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h2 className="font-bold tracking-tight">Backend & sync</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 rounded-xl text-xs text-muted-foreground"
          onClick={onRecheck}
          disabled={checking}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
          Check
        </Button>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 p-4">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
            connected
              ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
              : "bg-amber-500/12 text-amber-600 dark:text-amber-300",
          )}
        >
          {checking ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : connected ? (
            <Check className="h-5 w-5" />
          ) : (
            <Wifi className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold tracking-tight">
            {checking ? "Checking connection…" : connected ? "Connected" : "Working offline"}
          </p>
          <p className="text-xs text-muted-foreground">
            {checking
              ? "One moment"
              : connected
                ? health.latencyMs !== null
                  ? `Your memory is synced · ${health.latencyMs}ms`
                  : "Your memory is synced"
                : partially
                  ? "Offline — new Drops are queued and sync when you're back online"
                  : "Offline mode — saved Drops stay on this device"}
          </p>
        </div>
      </div>

      {/* Developer diagnostics only */}
      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        Advanced
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advanced && "rotate-180")} />
      </button>
      {advanced && (
        <div className="space-y-1.5 rounded-2xl border border-border/70 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          {health?.diagnostics.map((line) => (
            <p key={line} className="font-mono">
              {line}
            </p>
          ))}
          {!health?.diagnostics.length && <p className="font-mono">no diagnostics yet</p>}
          <p className="pt-1">Nothing here is shared — it's only visible on this screen.</p>
        </div>
      )}
    </section>
  );
}

/**
 * Permissions — live runtime status for camera/mic/notifications with a
 * single entry point into the full Permissions screen.
 */
function PermissionsSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState<Record<PermissionKind, string | null>>({
    camera: null,
    microphone: null,
    notifications: null,
    photos: null,
    documents: null,
  });

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const next: Record<PermissionKind, string | null> = { camera: null, microphone: null, notifications: null, photos: null, documents: null };
      for (const kind of ["camera", "microphone", "notifications"] as PermissionKind[]) {
        try {
          const s = await getPermissionState(kind);
          if (!disposed) next[kind] = s.status;
        } catch {
          if (!disposed) next[kind] = null;
        }
      }
      if (!disposed) setStatuses(next);
    })();
    return () => {
      disposed = true;
    };
  }, []);

  const chip = (kind: PermissionKind) => {
    const s = statuses[kind];
    if (s === "granted") return <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-300">Allowed</span>;
    if (s === "denied" || s === "limited") return <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-xs font-bold text-amber-600 dark:text-amber-300">Not allowed</span>;
    return <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">Checking…</span>;
  };

  return (
    <section className="space-y-1 rounded-3xl border border-border/80 bg-card p-2">
      <div className="flex items-center justify-between px-3 pb-1 pt-2">
        <h2 className="flex items-center gap-2 font-bold tracking-tight">
          <ShieldIcon className="h-4 w-4 text-primary" /> {t("permissions.title")}
        </h2>
        <button
          type="button"
          onClick={() => navigate("/app/permissions")}
          className="flex cursor-pointer items-center gap-0.5 text-xs font-semibold text-primary"
        >
          {t("permissions.manageAll")} <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <SettingRow icon={Camera as typeof Sun} title={t("permissions.camera")} desc={t("permissions.cameraDesc")}>
        {chip("camera")}
      </SettingRow>
      <SettingRow icon={Mic as typeof Sun} title={t("permissions.microphone")} desc={t("permissions.microphoneDesc")}>
        {chip("microphone")}
      </SettingRow>
      <SettingRow icon={Bell as typeof Sun} title={t("permissions.notifications")} desc={t("permissions.notificationsDesc")}>
        {chip("notifications")}
      </SettingRow>
      <p className="px-3 pb-3 pt-1 text-xs leading-relaxed text-muted-foreground">
        {t("permissions.settingsNote")}
      </p>
    </section>
  );
}

/** Notifications — what DROP uses them for, with a path to manage them. */
function NotificationsSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <section className="space-y-1 rounded-3xl border border-border/80 bg-card p-2">
      <div className="px-3 pb-1 pt-2">
        <h2 className="flex items-center gap-2 font-bold tracking-tight">
          <Bell className="h-4 w-4 text-primary" /> {t("permissions.notifications")}
        </h2>
      </div>
      <SettingRow icon={CalendarClock as typeof Sun} title={t("permissions.reminders")} desc={t("permissions.remindersDesc")}>
        <button
          type="button"
          onClick={() => navigate("/app/permissions")}
          className="cursor-pointer text-xs font-semibold text-primary"
        >
          {t("permissions.manage")}
        </button>
      </SettingRow>
      <p className="px-3 pb-3 pt-1 text-xs leading-relaxed text-muted-foreground">
        {t("permissions.notificationsDesc")}
      </p>
    </section>
  );
}

/** Storage used — real bytes from the Storage API, with the biggest files. */
function StorageUsageRow({ uid }: { uid: string | null }) {
  const [usage, setUsage] = useState<{ bytes: number; files: number; largest: Array<{ name: string; bytes: number }> } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    let disposed = false;
    void storageService.usage(uid).then((u) => {
      if (!disposed) {
        setUsage(u);
        setLoading(false);
      }
    });
    return () => {
      disposed = true;
    };
  }, [uid]);

  const fmt = (bytes: number) =>
    bytes >= 1_000_000_000
      ? `${(bytes / 1_000_000_000).toFixed(2)} GB`
      : bytes >= 1_000_000
        ? `${(bytes / 1_000_000).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1000))} KB`;

  return (
    <div className="rounded-2xl border border-border/70 bg-muted/40 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Storage used</p>
        <span className="rounded-xl bg-muted px-2.5 py-1 text-xs font-bold">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : usage ? fmt(usage.bytes) : "—"}
        </span>
      </div>
      {usage && usage.largest.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {usage.largest.map((f) => (
            <div key={f.name} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 font-semibold">{fmt(f.bytes)}</span>
            </div>
          ))}
        </div>
      )}
      {usage && usage.files === 0 && <p className="mt-2 text-xs text-muted-foreground">No files saved yet.</p>}
      {!loading && !usage && <p className="mt-2 text-xs text-muted-foreground">Couldn't read storage right now.</p>}
    </div>
  );
}

function SettingRow({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof Sun;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-3 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{desc}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * DROP Intelligence — the only AI settings consumers ever see. Status, one
 * Wi-Fi toggle, storage, and model controls. No models, no keys, no servers.
 * Technical details live behind "Advanced".
 */
function DropIntelligenceSection({
  health,
  checking,
  onRecheck,
  wifiOnly,
  onWifiOnlyChange,
  storageBytes,
  onRefreshStorage,
}: {
  health: WebAIHealth | null;
  checking: boolean;
  onRecheck: () => void;
  wifiOnly: boolean;
  onWifiOnlyChange: (v: boolean) => void;
  storageBytes: number | null;
  onRefreshStorage: () => void;
}) {
  const { engine, status } = useDropAI();
  const [advanced, setAdvanced] = useState(false);
  const [removing, setRemoving] = useState(false);
  const native = isNative();

  useEffect(() => {
    void onRefreshStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloading = status.phase === "downloading";
  const detecting = status.phase === "detecting";
  const ready = status.phase === "ready";
  const needsConfirmation = status.phase === "error" && status.label === "needs_confirmation";
  const pct = Math.round((status.progress ?? 0) * 100);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await engine?.removeModel();
      await onRefreshStorage();
      toast("AI engine removed — DROP still works, just lighter");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-3xl border border-border/80 bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-bold tracking-tight">DROP Intelligence</h2>
        </div>
        {!native && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 rounded-xl text-xs text-muted-foreground"
            onClick={onRecheck}
            disabled={checking}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
            Re-check
          </Button>
        )}
        {native && !downloading && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 rounded-xl text-xs text-muted-foreground"
            onClick={() => void engine?.prepare()}
            disabled={detecting}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", detecting && "animate-spin")} />
            Re-check
          </Button>
        )}
      </div>

      {/* Status card */}
      <div className="rounded-2xl border border-border/70 bg-muted/40 p-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
              ready
                ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
                : downloading
                  ? "bg-primary/12 text-primary"
                  : "bg-amber-500/12 text-amber-600 dark:text-amber-300",
            )}
          >
            {ready ? (
              <Check className="h-5 w-5" />
            ) : downloading || detecting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tracking-tight">
              {downloading
                ? "Preparing your private AI…"
                : detecting
                  ? "Checking this device…"
                  : needsConfirmation
                    ? "One-time AI setup"
                    : "Ready"}
            </p>
            <p className="text-xs text-muted-foreground">
              {downloading
                ? `${status.label ?? "Downloading AI model"} · ${pct}%`
                : detecting
                  ? "DROP is picking the best engine for your device"
                  : needsConfirmation
                    ? "DROP needs to download its AI engine once (≈1.8 GB)"
                    : native
                      ? "Processing runs on this device"
                      : health?.ok
                        ? health.local
                          ? "Built-in engine — no configuration needed"
                          : "Optional cloud intelligence is enabled"
                        : "Built-in engine — no configuration needed"}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-xl px-2.5 py-1 text-xs font-bold",
              ready ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300" : "bg-accent text-accent-foreground",
            )}
          >
            {downloading ? `${pct}%` : native ? "On device" : "Automatic"}
          </span>
        </div>

        {downloading && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {needsConfirmation && native && (
          <div className="mt-3 space-y-2">
            <p className="text-xs leading-relaxed text-muted-foreground">
              This one-time download makes DROP smarter on your device. You can
              use DROP normally while it downloads.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="gap-1.5 rounded-xl"
                onClick={async () => {
                  await engine?.setPolicy({ wifiOnly: false });
                  await onWifiOnlyChange(false);
                  await engine?.prepare();
                }}
              >
                <Download className="h-3.5 w-3.5" /> Download now
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setAdvanced((a) => !a)}>
                Wait for Wi-Fi
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Simple controls (native) */}
      {native && ready && (
        <div className="space-y-1">
          <SettingRow icon={Wifi} title="Download over Wi-Fi only" desc="Large AI downloads wait until you're on Wi-Fi">
            <Switch checked={wifiOnly} onCheckedChange={(v) => void onWifiOnlyChange(v)} />
          </SettingRow>
          {storageBytes !== null && storageBytes > 0 && (
            <SettingRow icon={HardDrive} title="AI engine storage" desc="Space used by the on-device AI engine">
              <span className="rounded-xl bg-muted px-2.5 py-1 text-xs font-bold">
                {(storageBytes / 1_000_000_000).toFixed(1)} GB
              </span>
            </SettingRow>
          )}
          {storageBytes !== null && storageBytes > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-3 gap-1.5 rounded-xl text-xs text-muted-foreground hover:text-destructive"
              onClick={() => void handleRemove()}
              disabled={removing}
            >
              {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Remove downloaded AI engine
            </Button>
          )}
        </div>
      )}

      {/* Advanced (diagnostics only) */}
      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        Advanced
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advanced && "rotate-180")} />
      </button>
      {advanced && (
        <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" /> Engine status:{" "}
            <span className="font-mono font-semibold">{status.phase}</span>
            {status.tier && (
              <>
                · tier <span className="font-mono font-semibold">{status.tier}</span>
              </>
            )}
          </p>
          {health?.activeProvider && (
            <p className="font-mono">server pipeline: {health.activeProvider}</p>
          )}
          <p>DROP picks the best engine automatically — nothing to configure.</p>
        </div>
      )}
    </section>
  );
}
