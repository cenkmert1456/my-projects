import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState, ScreenSkeleton, StateError } from "@/components/app/DataStates";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeQuery } from "@/hooks/use-realtime-query";
import { collectionService, dropService } from "@/lib/services";
import type { Drop } from "@/lib/supabase/database.types";
import { FolderHeart, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function Collections() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const { data: collections, loading, error, refetch } = useRealtimeQuery(
    () => collectionService.list(uid as string),
    { table: "collections", userId: uid },
  );
  const { data: allDrops } = useRealtimeQuery(
    () => dropService.listAll(uid as string),
    { table: "drops", userId: uid },
  );
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📁");
  const navigate = useNavigate();

  const magic = useMemo(() => {
    if (!allDrops) return [];
    const now = Date.now();
    const startOfWeek = now - 7 * 86400000;
    const future = (d: Drop) =>
      (d.event?.startTime && d.event.startTime > now) ||
      (d.reservation?.startTime && d.reservation.startTime > now) ||
      (d.flight?.departureTime && d.flight.departureTime > now) ||
      (d.receipt?.returnDeadline && d.receipt.returnDeadline > now);
    const travel = (d: Drop) => Boolean(d.flight || d.event || d.reservation || (d.category === "Travel"));
    const isImage = (d: Drop) => d.kind === "screenshot" || d.kind === "image";
    return [
      { id: "trips", name: "Trips", emoji: "✈️", drops: allDrops.filter(travel) },
      { id: "receipts", name: "Receipts", emoji: "🧾", drops: allDrops.filter((d) => d.category === "Receipts" || d.receipt) },
      { id: "products", name: "Products", emoji: "🛍️", drops: allDrops.filter((d) => d.product || d.category === "Products") },
      { id: "places", name: "Places", emoji: "📍", drops: allDrops.filter((d) => d.place || d.category === "Places") },
      { id: "documents", name: "Documents", emoji: "📄", drops: allDrops.filter((d) => d.kind === "document") },
      { id: "favorites", name: "Favorites", emoji: "⭐", drops: allDrops.filter((d) => d.starred) },
      { id: "thisweek", name: "This Week", emoji: "🗓️", drops: allDrops.filter((d) => d.savedAt >= startOfWeek) },
      { id: "screenshots", name: "Screenshots", emoji: "📸", drops: allDrops.filter(isImage) },
      { id: "upcoming", name: "Upcoming", emoji: "⏰", drops: allDrops.filter(future) },
    ].filter((m) => m.drops.length > 0);
  }, [allDrops]);

  const handleCreate = async () => {
    if (!name.trim() || !uid) return;
    const created = await collectionService.create(uid, { name: name.trim(), emoji });
    setCreating(false);
    setName("");
    toast("Collection created");
    navigate(`/app/collections/${created.id}`);
  };

  if (loading && !collections) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav.collections")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("states.loadingMemory")}</p>
        </div>
        <ScreenSkeleton items={4} />
      </div>
    );
  }

  if (error && !collections) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.collections")}</h1>
        <StateError message={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav.collections")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            DROP builds some for you automatically. The rest is up to you.
          </p>
        </div>
        <Button
          className="gap-2 rounded-2xl font-semibold"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" strokeWidth={3} />
          New
        </Button>
      </div>

      {magic.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Auto collections
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {magic.map((m) => (
              <MagicCard key={m.id} m={m} onClick={() => navigate(`/app/search?${toMagicQuery(m.id)}`)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          {t("nav.collections")}
        </h2>
        {collections && collections.length === 0 ? (
          <EmptyState
            icon={FolderHeart}
            title={t("empty.collectionsTitle")}
            description={t("empty.collectionsDesc")}
            action={
              <Button className="gap-2 rounded-2xl" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> {t("empty.createCollection")}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(collections ?? []).map((c) => (
              <button
                key={c._id}
                type="button"
                onClick={() => navigate(`/app/collections/${c._id}`)}
                className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-border/80 bg-card p-4 text-left transition-all hover:border-primary/30 active:scale-[0.98]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                  {c.emoji ?? "📁"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.dropCount ?? 0} {t("nav.saved")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="tracking-tight">New collection</DialogTitle>
            <DialogDescription>Name it anything — trips, projects, moods.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-2xl">
              {emoji}
            </span>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
              className="h-12 rounded-2xl"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!name.trim()} onClick={() => void handleCreate()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MagicCard({
  m,
  onClick,
}: {
  m: { name: string; emoji: string; drops: Drop[] };
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-border/80 bg-card p-4 text-left transition-all hover:border-primary/30 active:scale-[0.98]"
    >
      <span className="text-2xl">{m.emoji}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{m.name}</span>
        <span className="block text-xs text-muted-foreground">{m.drops.length}</span>
      </span>
    </button>
  );
}

function toMagicQuery(id: string): string {
  const q: Record<string, string> = {
    trips: "trip OR flight OR travel",
    receipts: "receipt",
    products: "product",
    places: "place",
    documents: "document",
    favorites: "favorite",
    thisweek: "this week",
    screenshots: "screenshot",
    upcoming: "upcoming",
  };
  return `q=${encodeURIComponent(q[id] ?? "")}`;
}
