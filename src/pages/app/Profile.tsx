import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeQuery } from "@/hooks/use-realtime-query";
import { profileService, searchService } from "@/lib/services";
import {
  Archive,
  CalendarClock,
  ChevronRight,
  Download,
  Heart,
  Globe,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Moon,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Trash2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const IS_DEV = import.meta.env.DEV;

export default function Profile() {
  const { t } = useTranslation();
  const { user, signOut, refreshProfile } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const uid = user?.id ?? null;

  const { data: stats } = useRealtimeQuery(
    () => profileService.stats(uid as string),
    { table: "drops", userId: uid },
  );
  const { data: plan } = useRealtimeQuery(
    () => profileService.planInfo(uid as string),
    { table: "profiles", userId: uid, rowId: uid },
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [exporting, setExporting] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const dark = resolvedTheme === "dark";

  const statItems = stats
    ? [
        { label: t("nav.saved"), value: stats.total, icon: Archive },
        { label: t("nav.places"), value: stats.places, icon: MapPin },
        { label: t("nav.wishlist"), value: stats.products, icon: Heart },
        { label: t("nav.upcoming"), value: stats.upcoming, icon: CalendarClock },
        { label: "Rediscovered", value: stats.rediscovered, icon: Search },
      ]
    : [];

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
      toast(t("profile.exportData"));
    } catch {
      toast("Couldn't export your data — try again");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      {/* Identity header — real profile data, never "Guest" */}
      <div className="flex items-center gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-primary/12 text-2xl font-extrabold text-primary">
          {(user?.name ?? user?.email ?? "D")[0]?.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await profileService.updateProfile(uid as string, { name: name.trim() || undefined });
              await refreshProfile();
              toast(t("profile.nameSaved"));
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-full max-w-56 border-transparent bg-transparent px-0 text-xl font-extrabold tracking-tight hover:border-border focus-visible:ring-0"
            />
          </form>
          {user?.email && (
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          )}
        </div>
        <Button
          variant="ghost"
          className="gap-2 rounded-2xl text-muted-foreground"
          onClick={() => void signOut().then(() => navigate("/"))}
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">{t("profile.signOut")}</span>
        </Button>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-2.5">
        {statItems.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/80 bg-card p-3.5">
            <s.icon className="h-4 w-4 text-primary" />
            <p className="mt-2 text-2xl font-extrabold tracking-tight">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </section>

      {/* Plan */}
      {plan && (
        <section className="rounded-3xl border border-primary/25 bg-gradient-to-br from-accent/60 via-card to-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">
                {plan.planStatus === "trialing" ? "Pro trial" : plan.planName}
              </p>
              <p className="mt-1 text-lg font-extrabold tracking-tight">
                {plan.isUnlimited ? "Unlimited Drops" : `${plan.dropCount} / ${plan.dropLimit} Drops`}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {plan.isUnlimited
                  ? "Enjoy everything DROP can do."
                  : plan.dropCount >= (plan.dropLimit ?? 0)
                    ? "You've hit the free limit — upgrade for unlimited."
                    : "Basic search + AI organization included."}
              </p>
            </div>
            {!plan.isUnlimited && (
              <Button className="rounded-2xl font-semibold" onClick={() => toast("Billing is next on our roadmap — your Drops are never at risk.")}>
                Upgrade
              </Button>
            )}
          </div>
        </section>
      )}

      {/* Settings */}
      <section className="space-y-1 rounded-3xl border border-border/80 bg-card p-2">
        <SettingRow
          icon={dark ? Sun : Moon}
          title={t("profile.appearance")}
          desc={dark ? t("profile.darkMode") : t("profile.lightMode")}
        >
          <Switch checked={dark} onCheckedChange={(v) => setTheme(v ? "dark" : "light")} />
        </SettingRow>
        <button
          type="button"
          onClick={() => navigate("/app/settings")}
          className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-muted/40"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
            <Globe className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t("profile.language")}</span>
            <span className="block truncate text-xs text-muted-foreground">{t("common.settings")}</span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
        <SettingRow icon={Search} title={t("profile.searchHistory")} desc={t("profile.searchHistoryDesc")}>
          <Switch
            defaultChecked={user?.searchHistoryEnabled !== false}
            onCheckedChange={(v) => void profileService.updateProfile(uid as string, { searchHistoryEnabled: v })}
          />
        </SettingRow>
        <SettingRow icon={Sparkles} title={t("profile.dailyRecall")} desc={t("profile.dailyRecallDesc")}>
          <Switch
            defaultChecked={user?.dailyRecallEnabled !== false}
            onCheckedChange={(v) => void profileService.updateProfile(uid as string, { dailyRecallEnabled: v })}
          />
        </SettingRow>
      </section>

      {/* Data */}
      <section className="space-y-2.5">
        <Button variant="outline" className="w-full justify-start gap-2.5 rounded-2xl" onClick={() => void handleExport()}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {t("profile.exportData")}
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start gap-2.5 rounded-2xl"
          onClick={async () => {
            await searchService.clearSearchHistory(uid as string);
            toast(t("profile.clearSearchHistory"));
          }}
        >
          <Trash2 className="h-4 w-4" /> {t("profile.clearSearchHistory")}
        </Button>
      </section>

      {/* Developer settings — development builds only */}
      {IS_DEV && (
        <details className="rounded-3xl border border-border/70 bg-muted/20 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
            {t("profile.developer")}
          </summary>
          <div className="mt-3">
            <Button
              variant="outline"
              className="w-full justify-start gap-2.5 rounded-2xl"
              onClick={async () => {
                setSeeding(true);
                try {
                  await profileService.loadDemoData(uid as string);
                  toast("Sample Drops added — search them by name");
                } finally {
                  setSeeding(false);
                }
              }}
            >
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {t("profile.loadSampleData")}
            </Button>
          </div>
        </details>
      )}

      {/* Privacy + delete */}
      <section className="space-y-3 rounded-3xl border border-border/80 bg-card p-5">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-bold">{t("profile.privateByDefault")}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {t("profile.privateByDefaultDesc")}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2.5 rounded-2xl text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-4 w-4" /> {t("profile.deleteAccount")}
        </Button>
      </section>

      <div className="flex items-center justify-center gap-2 pb-4 text-muted-foreground">
        <Logo className="scale-75" />
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="tracking-tight">{t("profile.deleteAccount")}</DialogTitle>
            <DialogDescription>
              This permanently deletes all your Drops, files, collections,
              reminders and search history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Keep my Drops
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await profileService.deleteAccount(uid as string);
                await signOut();
                navigate("/");
                toast("Account deleted. Goodbye 👋");
              }}
            >
              Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
