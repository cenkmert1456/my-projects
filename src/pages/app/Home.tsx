import { AddDropContext } from "@/components/app/AddDropContext";
import { DropCard } from "@/components/drops/DropCard";
import { EmptyState, ScreenSkeleton, StateError } from "@/components/app/DataStates";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeQuery } from "@/hooks/use-realtime-query";
import { collectionService, dropService } from "@/lib/services";
import { greetingKey } from "@/lib/format";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  CalendarClock,
  Camera,
  ChevronRight,
  FileUp,
  ImagePlus,
  Link2,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  FolderHeart,
} from "lucide-react";
import { useContext, useMemo } from "react";
import { useNavigate } from "react-router";

const QUICK_ACTIONS = [
  { kind: "screenshot", icon: Camera },
  { kind: "image", icon: ImagePlus },
  { kind: "link", icon: Link2 },
  { kind: "note", icon: StickyNote },
  { kind: "document", icon: FileUp },
] as const;

export default function Home() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { open: openAdd, openWithKind } = useContext(AddDropContext);
  const userId = user?.id;

  // Recent — the primary feed. Explicit INITIAL_LOADING / READY / EMPTY / ERROR.
  const recent = useRealtimeQuery(
    () => (userId ? dropService.listRecent(userId, 12) : Promise.resolve([])),
    { table: "drops", userId },
  );

  // Secondary sections load independently — they NEVER block the page.
  const upcoming = useRealtimeQuery(
    () => (userId ? dropService.upcoming(userId) : Promise.resolve([])),
    { table: "drops", userId },
  );
  const collections = useRealtimeQuery(
    () => (userId ? collectionService.list(userId) : Promise.resolve([])),
    { table: "collections", userId },
  );
  const allDrops = useRealtimeQuery(
    () => (userId ? dropService.listAll(userId) : Promise.resolve([])),
    { table: "drops", userId },
  );

  const forYou = useMemo(() => {
    const data = allDrops.data ?? [];
    if (data.length < 3) return [];
    return data
      .filter((d) => d.status === "ready")
      .filter((d) => !d.starred && !d.archived)
      .sort((a, b) => a.savedAt - b.savedAt)
      .slice(0, 3);
  }, [allDrops.data]);

  const firstName = (user?.name ?? user?.email ?? "friend").split(/[\s@]/)[0];
  const greetingKeyName = greetingKey();

  return (
    <div className="space-y-6 pb-2 lg:space-y-8">
      {/* Compact contextual header — greeting + avatar, no website navbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            {t(`greeting.${greetingKeyName}`)}, {firstName}.
          </p>
          <h1 className="mt-0.5 text-[24px] font-extrabold leading-tight tracking-tight sm:text-3xl">
            {t("home.searchBig")}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => navigate("/app/profile")}
          className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary/15 text-base font-bold text-primary transition-transform active:scale-95"
          aria-label={t("nav.you")}
        >
          {(user?.name ?? user?.email ?? "D")[0]?.toUpperCase()}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-background bg-emerald-500" />
        </button>
      </div>

      {/* Big search field — the product promise */}
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          navigate("/app/search");
        }}
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <button
          type="button"
          onClick={() => navigate("/app/search")}
          className="flex h-14 w-full cursor-pointer items-center rounded-2xl border border-border/80 bg-card pl-12 pr-4 text-left text-[15px] text-muted-foreground transition-all active:scale-[0.99]"
        >
          {t("home.searchPlaceholder")}
        </button>
      </form>

      {/* Primary capture action */}
      <Button
        onClick={() => {
          void import("@/lib/mobile/native").then(({ haptic }) => haptic("light"));
          openAdd();
        }}
        className="h-14 w-full gap-2.5 rounded-2xl text-[15px] font-semibold shadow-none lg:hidden"
      >
        <Plus className="h-5 w-5" strokeWidth={3} />
        {t("home.dropSomething")}
      </Button>

      {/* Quick actions */}
      <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.kind}
            type="button"
            onClick={() => openWithKind?.(action.kind)}
            className="flex shrink-0 cursor-pointer items-center gap-2 rounded-2xl border border-border/80 bg-card px-4 py-3 text-sm font-medium transition-all hover:border-primary/40 hover:bg-accent/50 active:scale-[0.98]"
          >
            <action.icon className="h-4 w-4 text-primary" />
            {t(`capture.${action.kind === "image" ? "photos" : action.kind}`)}
          </button>
        ))}
      </div>

      {/* Upcoming strip — only when it has content */}
      {upcoming.data && upcoming.data.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
              <CalendarClock className="h-4 w-4 text-primary" /> {t("home.upcoming")}
            </h2>
            <button
              type="button"
              onClick={() => navigate("/app/upcoming")}
              className="flex items-center gap-0.5 text-sm font-medium text-primary"
            >
              {t("home.seeAll")}
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
            {upcoming.data.slice(0, 6).map((drop) => (
              <motion.button
                key={drop._id}
                type="button"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => navigate(`/app/drop/${drop._id}`)}
                className="flex min-w-56 cursor-pointer items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 text-left transition-all hover:border-primary/30 active:scale-[0.98]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-lg">
                  {drop.event ? "🎟️" : "✈️"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{drop.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {drop.event?.startTime
                      ? new Date(drop.event.startTime).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : drop.flight?.departureTime
                        ? new Date(drop.flight.departureTime).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        : t("home.recent")}
                  </span>
                </span>
              </motion.button>
            ))}
          </div>
        </section>
      )}

      {/* Collections row — only when there are collections */}
      {collections.data && collections.data.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
              <FolderHeart className="h-4 w-4 text-primary" /> {t("nav.collections")}
            </h2>
            <button
              type="button"
              onClick={() => navigate("/app/collections")}
              className="flex items-center gap-0.5 text-sm font-medium text-primary"
            >
              {t("home.seeAll")}
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
            {collections.data.slice(0, 8).map((c) => (
              <button
                key={c._id}
                type="button"
                onClick={() => navigate(`/app/collections/${c._id}`)}
                className="flex shrink-0 cursor-pointer flex-col items-start gap-2.5 rounded-2xl border border-border/80 bg-card p-3.5 text-left transition-all hover:border-primary/30 active:scale-[0.98]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                  {c.emoji ?? "📁"}
                </span>
                <span className="max-w-36">
                  <span className="block truncate text-sm font-semibold">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.dropCount ?? 0} {t("nav.saved")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Recent drops — the main feed with explicit states */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight">{t("home.recent")}</h2>
          <button
            type="button"
            onClick={() => navigate("/app/inbox")}
            className="flex items-center gap-0.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t("nav.inbox")} <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {recent.loading && !recent.data ? (
          <ScreenSkeleton items={6} />
        ) : recent.error && !recent.data ? (
          <StateError message={recent.error} onRetry={recent.refetch} />
        ) : recent.data && recent.data.length === 0 ? (
          <EmptyHome onAdd={openAdd} onKind={(k) => openWithKind?.(k)} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(recent.data ?? []).map((drop, i) => (
              <DropCard key={drop._id} drop={drop} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* From your memory — daily recall */}
      {forYou.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
              <Sparkles className="h-4 w-4 text-primary" /> {t("home.fromYourDrops")}
            </h2>
          </div>
          <div className="space-y-2.5">
            {forYou.map((drop) => (
              <button
                key={drop._id}
                type="button"
                onClick={() => navigate(`/app/drop/${drop._id}`)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3 text-left transition-all hover:border-primary/30 active:scale-[0.99]"
              >
                <span className="text-xl">{drop.storagePath ? "🖼️" : "💭"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{drop.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {drop.product?.price !== undefined
                      ? `${t("profile.about")} — ${drop.product.price} ${drop.product.currency ?? ""}`
                      : drop.category}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EmptyHome({
  onAdd,
  onKind,
}: {
  onAdd: () => void;
  onKind: (kind: (typeof QUICK_ACTIONS)[number]["kind"]) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <EmptyState
        icon={Plus}
        title={t("home.emptyTitle")}
        description={t("home.emptyDesc")}
        action={
          <Button onClick={onAdd} className="h-12 gap-2 rounded-2xl px-6 font-semibold">
            <Plus className="h-4 w-4" strokeWidth={3} />
            {t("home.addFirst")}
          </Button>
        }
      />
      <div className="flex flex-wrap justify-center gap-2">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.kind}
            type="button"
            onClick={() => onKind(action.kind)}
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border/80 bg-card px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground active:scale-[0.98]"
          >
            <action.icon className="h-3.5 w-3.5 text-primary" />
            {t(`capture.${action.kind === "image" ? "photos" : action.kind}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
