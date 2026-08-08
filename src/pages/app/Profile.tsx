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
  Download,
  Heart,
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

export default function Profile() {
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
        { label: "Drops", value: stats.total, icon: Archive },
        { label: "Places", value: stats.places, icon: MapPin },
        { label: "Products", value: stats.products, icon: Heart },
        { label: "Upcoming", value: stats.upcoming, icon: CalendarClock },
        { label: "Cities", value: stats.cities, icon: Sparkles },
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
      toast("Your data is downloading");
    } catch {
      toast("Couldn't export your data — try again");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/12 text-2xl font-extrabold text-primary">
          {(user?.name ?? user?.email ?? "D")[0]?.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await profileService.updateProfile(uid as string, { name: name.trim() || undefined });
              await refreshProfile();
              toast("Name saved");
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-full max-w-56 border-transparent bg-transparent px-0 text-xl font-extrabold tracking-tight hover:border-border focus-visible:ring-0"
            />
          </form>
          <p className="text-sm text-muted-foreground">{user?.email ?? "Guest account"}</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => void signOut().then(() => navigate("/"))}>
          <LogOut className="h-4 w-4" /> Sign out
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
          title="Appearance"
          desc={dark ? "Dark mode" : "Light mode"}
        >
          <Switch checked={dark} onCheckedChange={(v) => setTheme(v ? "dark" : "light")} />
        </SettingRow>
        <SettingRow icon={Search} title="Search history" desc="Save my searches to make repeat lookups faster">
          <Switch
            defaultChecked={user?.searchHistoryEnabled !== false}
            onCheckedChange={(v) => void profileService.updateProfile(uid as string, { searchHistoryEnabled: v })}
          />
        </SettingRow>
        <SettingRow icon={Sparkles} title="Daily recall" desc="Occasionally resurface forgotten Drops on Home">
          <Switch
            defaultChecked={user?.dailyRecallEnabled !== false}
            onCheckedChange={(v) => void profileService.updateProfile(uid as string, { dailyRecallEnabled: v })}
          />
        </SettingRow>
      </section>

      {/* Data */}
      <section className="space-y-2.5">
        <Button variant="outline" className="w-full justify-start gap-2.5 rounded-2xl" onClick={() => void handleExport()}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export my data (JSON)
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start gap-2.5 rounded-2xl"
          onClick={async () => {
            await searchService.clearSearchHistory(uid as string);
            toast("Search history cleared");
          }}
        >
          <Trash2 className="h-4 w-4" /> Clear search history
        </Button>
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
          {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Load sample data
        </Button>
      </section>

      {/* Privacy + delete */}
      <section className="space-y-3 rounded-3xl border border-border/80 bg-card p-5">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-bold">Private by default</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Your Drops are never public, files are served with signed URLs, and
              your content is never used to train models. You can export or delete
              everything, anytime.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2.5 rounded-2xl text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-4 w-4" /> Delete my account and all my Drops
        </Button>
      </section>

      <div className="flex items-center justify-center gap-2 pb-4 text-muted-foreground">
        <Logo className="scale-75" />
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="tracking-tight">Delete your account?</DialogTitle>
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
