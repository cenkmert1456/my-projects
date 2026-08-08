import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Bot,
  Check,
  Cpu,
  Download,
  Fingerprint,
  Globe,
  Loader2,
  Lock,
  Moon,
  RefreshCw,
  Search,
  Shield,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isNative } from "@/lib/mobile/platform";
import { biometricsAvailable } from "@/lib/mobile/native";
import { setAppLockDelay, setAppLockEnabled, type LockDelay } from "@/lib/mobile/app-lock";

type AIHealth = {
  ok: boolean;
  provider: string;
  label: string;
  local: boolean;
  models?: { text?: string; vision?: string; embedding?: string };
  latencyMs?: number;
  error?: string;
  activeProvider?: string;
};

export default function Settings() {
  const { user } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const navigate = useNavigate();
  const updateProfile = useMutation(api.profile.updateProfile);
  const exportData = useQuery(api.profile.exportData);
  const checkAI = useAction(api.aiHealth.checkAI);
  const [health, setHealth] = useState<AIHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [appLockOn, setAppLockOn] = useState(false);
  const [lockDelay, setLockDelay] = useState<LockDelay>("immediate");
  const [biometricOk, setBiometricOk] = useState(false);
  const [wifiOnly, setWifiOnly] = useState(false);

  const runHealthCheck = async () => {
    setChecking(true);
    try {
      const res = await checkAI();
      setHealth(res as AIHealth);
    } catch {
      setHealth({
        ok: false,
        provider: "unknown",
        label: "Health check failed",
        local: false,
        error: "Couldn't reach the AI configuration service. Try again in a moment.",
      });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void runHealthCheck();
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

  const handleExport = () => {
    if (!exportData?.json) return;
    const blob = new Blob([exportData.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drop-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Your data is downloading");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your memory, your rules.
        </p>
      </div>

      {/* AI & Privacy */}
      <section className="space-y-4 rounded-3xl border border-border/80 bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="font-bold tracking-tight">AI & Privacy</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 rounded-xl text-xs text-muted-foreground"
            onClick={() => void runHealthCheck()}
            disabled={checking}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
            Re-check
          </Button>
        </div>

        <div className="rounded-2xl border border-border/70 bg-muted/40 p-4">
          {checking && !health ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Checking your AI setup…
            </div>
          ) : health ? (
            <div>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                    health.ok
                      ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
                      : "bg-amber-500/12 text-amber-600 dark:text-amber-300",
                  )}
                >
                  {health.ok ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold tracking-tight">{health.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {health.ok
                      ? health.local
                        ? "Your AI processing runs on your own server. Your content never leaves your machine."
                        : "Cloud AI provider — content is processed by the provider you configured."
                      : "Not connected"}
                  </p>
                </div>
                {health.latencyMs !== undefined && (
                  <span className="shrink-0 rounded-xl bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                    {health.latencyMs}ms
                  </span>
                )}
              </div>

              {health.ok && health.models && (
                <div className="mt-3 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-3">
                  <ModelStat label="Text" value={health.models.text ?? "—"} />
                  <ModelStat label="Vision" value={health.models.vision ?? "—"} />
                  <ModelStat label="Embeddings" value={health.models.embedding ?? "—"} />
                </div>
              )}

              {!health.ok && health.error && (
                <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                  {health.error}
                </p>
              )}

              {health.ok && health.local && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/8 px-3 py-2.5">
                  <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <span className="font-bold text-foreground">Local AI</span> — your AI
                    processing is configured through your own server. DROP never uploads
                    your screenshots to a third party. (Database & files still live in
                    DROP's cloud.)
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="space-y-1">
          <SettingRow
            icon={Lock}
            title="Private by default"
            desc="Every Drop starts private. Sharing is always your choice."
          >
            <Lock className="h-4 w-4 text-emerald-500" />
          </SettingRow>
          <SettingRow
            icon={Search}
            title="Search history"
            desc="Save my searches to make repeat lookups faster"
          >
            <Switch
              defaultChecked={user?.searchHistoryEnabled !== false}
              onCheckedChange={(v) => void updateProfile({ patch: { searchHistoryEnabled: v } })}
            />
          </SettingRow>
        </div>
      </section>

      {/* Appearance */}
      <section className="space-y-4 rounded-3xl border border-border/80 bg-card p-5">
        <div className="flex items-center gap-2">
          <Sun className="h-5 w-5 text-primary" />
          <h2 className="font-bold tracking-tight">Appearance</h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: "light", label: "Light", icon: Sun },
            { id: "dark", label: "Dark", icon: Moon },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTheme(id);
                void updateProfile({ patch: { theme: id } });
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border p-4 transition-colors",
                dark === (id === "dark")
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-muted/30 text-muted-foreground hover:border-primary/30 hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-semibold">{label}</span>
            </button>
          ))}
        </div>
      </section>

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
            onCheckedChange={(v) => void updateProfile({ patch: { dailyRecallEnabled: v } })}
          />
        </SettingRow>
        <SettingRow icon={Search} title="Search history" desc="Save my searches to make repeat lookups faster">
          <Switch
            defaultChecked={user?.searchHistoryEnabled !== false}
            onCheckedChange={(v) => void updateProfile({ patch: { searchHistoryEnabled: v } })}
          />
        </SettingRow>
        <SettingRow icon={Globe} title="Language" desc="Your UI language — English for now, more coming">
          <span className="rounded-xl bg-muted px-2.5 py-1 text-xs font-bold">EN</span>
        </SettingRow>
      </section>

      {/* Data & storage */}
      <section className="space-y-3 rounded-3xl border border-border/80 bg-card p-5">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-primary" />
          <h2 className="font-bold tracking-tight">Data & storage</h2>
        </div>
        <Button
          variant="outline"
          className="w-full justify-start gap-2.5 rounded-2xl"
          onClick={handleExport}
        >
          <Download className="h-4 w-4" /> Export my data (JSON)
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

function ModelStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card px-2.5 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[11px] font-semibold">{value}</p>
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
