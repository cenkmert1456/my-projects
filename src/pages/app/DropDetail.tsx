import { api } from "@/convex/_generated/api";
import { DropCard } from "@/components/drops/DropCard";
import { DropStatusBadge } from "@/components/drops/DropStatusBadge";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  FolderPlus,
  Loader2,
  Lock,
  Navigation,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Tag,
  Trash2,
  TrendingDown,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { CATEGORIES } from "@/convex/lib/constants";
import { CATEGORY_META, ENTITY_LABELS, KIND_META, SOURCE_META } from "@/lib/drop-meta";
import { formatDate, formatDateTime, formatPrice, hostOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function DropDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const data = useQuery(api.drops.get, { id: id as never });
  const storageUrl = useQuery(api.drops.getStorageUrl, data?.drop.storageId ? { storageId: data.drop.storageId } : "skip");
  const collections = useQuery(api.collections.list);
  const dropCollections = useQuery(api.collections.withDrop, { dropId: id as never });
  const reminders = useQuery(api.reminders.listForDrop, { dropId: id as never });

  const update = useMutation(api.drops.update);
  const toggleStar = useMutation(api.drops.toggleStar);
  const toggleArchive = useMutation(api.drops.toggleArchive);
  const removeDrop = useMutation(api.drops.remove);
  const addTag = useMutation(api.drops.addTag);
  const removeTag = useMutation(api.drops.removeTag);
  const retryAnalysis = useMutation(api.drops.retryAnalysis);
  const createReminder = useMutation(api.reminders.create);
  const completeReminder = useMutation(api.reminders.complete);
  const addToCollection = useMutation(api.collections.addDrop);
  const removeFromCollection = useMutation(api.collections.removeDrop);
  const createCollection = useMutation(api.collections.create);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [newTag, setNewTag] = useState("");
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderText, setReminderText] = useState("");
  const [reminderAt, setReminderAt] = useState<number | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");

  const drop = data?.drop ?? null;

  const entityGroups = useMemo(() => {
    if (!drop) return [];
    const groups: Array<{ label: string; values: string[] }> = [];
    const types = ["product", "brand", "place", "price", "date", "person", "event", "reservation", "phone", "url", "organization"];
    for (const t of types) {
      const values = drop.entities.filter((e) => e.type === t).map((e) => e.value);
      if (values.length) groups.push({ label: ENTITY_LABELS[t]?.label ?? t, values });
    }
    return groups;
  }, [drop]);

  if (!data || !drop) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const meta = CATEGORY_META[drop.category] ?? CATEGORY_META.Other;
  const sourceMeta = SOURCE_META[drop.source ?? ""];
  const related = data.related ?? [];

  const handleSaveEdit = async () => {
    await update({
      id: drop._id,
      patch: {
        title: editTitle.trim() || drop.title,
        summary: editSummary.trim() || undefined,
      },
    });
    setEditing(false);
    toast("Saved");
  };

  const mapsUrl = drop.place
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([drop.place.name, drop.place.city, drop.place.country].filter(Boolean).join(", "))}`
    : null;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Hero */}
      <div className="overflow-hidden rounded-3xl border border-border/80 bg-card">
        {drop.storageId ? (
          <div className="relative aspect-video w-full bg-muted sm:aspect-[21/9]">
            {storageUrl && (
              <img src={storageUrl} alt={drop.title} className="h-full w-full object-cover" />
            )}
            <DropStatusBadge status={drop.status} className="absolute bottom-3 left-3" />
            {drop.confidence !== undefined && (
              <span className="absolute bottom-3 right-3 rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
                {Math.round(drop.confidence * 100)}% confident
              </span>
            )}
          </div>
        ) : (
          <div className="flex aspect-[4/1] items-center justify-center bg-gradient-to-br from-accent/60 via-card to-card text-5xl">
            {KIND_META[drop.kind]?.emoji ?? "📦"}
          </div>
        )}

        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", meta.chip)}>
              {meta.emoji} {drop.category}
              {drop.subcategory ? ` · ${drop.subcategory}` : ""}
            </span>
            <span className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {KIND_META[drop.kind]?.label}
            </span>
            {sourceMeta && (
              <span className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {sourceMeta.emoji} {sourceMeta.label}
              </span>
            )}
            <span className="text-xs text-muted-foreground">Saved {formatDate(drop.savedAt)}</span>
          </div>

          {editing ? (
            <div className="mt-4 space-y-3">
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="text-lg font-bold" />
              <Textarea value={editSummary} onChange={(e) => setEditSummary(e.target.value)} rows={3} />
              <div className="flex gap-2">
                <Button onClick={handleSaveEdit}>
                  <Check className="mr-2 h-4 w-4" /> Save
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
                {drop.title}
              </h1>
              {drop.summary && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{drop.summary}</p>}
            </>
          )}

          {/* Smart actions */}
          <div className="mt-5 flex flex-wrap gap-2">
            {drop.url && (
              <a href={drop.url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5 rounded-xl">
                  <ExternalLink className="h-4 w-4" /> Open source
                </Button>
              </a>
            )}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5 rounded-xl">
                  <Navigation className="h-4 w-4" /> Open Maps
                </Button>
              </a>
            )}
            {drop.product && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-xl"
                onClick={() => toast("Price tracking coming soon — we'll watch it for you.")}
              >
                <TrendingDown className="h-4 w-4" /> Track price
              </Button>
            )}
            {drop.suggestedAction && (
              <Button
                size="sm"
                className="gap-1.5 rounded-xl"
                onClick={() => {
                  if (drop.suggestedAction?.toLowerCase().includes("remind")) setReminderOpen(true);
                  else toast(`Added to ${drop.suggestedAction}`);
                }}
              >
                <Calendar className="h-4 w-4" /> {drop.suggestedAction}
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => setReminderOpen(true)}>
              <Bell className="h-4 w-4" /> Remind me
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={cn("gap-1.5 rounded-xl", drop.starred && "border-amber-500/40 text-amber-600 dark:text-amber-300")}
              onClick={() => void toggleStar({ id: drop._id })}
            >
              <Star className={cn("h-4 w-4", drop.starred && "fill-amber-400 text-amber-400")} />
              {drop.starred ? "Favorited" : "Favorite"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => void toggleArchive({ id: drop._id })}>
              {drop.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {drop.archived ? "Unarchive" : "Archive"}
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 rounded-xl" onClick={() => { setEditTitle(drop.title); setEditSummary(drop.summary ?? ""); setEditing(true); }}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-xl text-destructive hover:text-destructive"
              onClick={async () => {
                if (window.confirm("Delete this Drop forever? Your file will be removed.")) {
                  await removeDrop({ id: drop._id });
                  toast("Drop deleted");
                  navigate("/app");
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-xl"
              onClick={() => {
                void navigator.clipboard.writeText(window.location.href);
                toast("Link copied");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Suggested reminder */}
      {drop.suggestedReminder && drop.status === "ready" && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-accent/50 p-4">
          <SparkleIcon />
          <div className="flex-1">
            <p className="text-sm font-semibold">{drop.suggestedReminder.text}</p>
            <p className="text-xs text-muted-foreground">DROP suggested this — set it or ignore it.</p>
          </div>
          <Button
            size="sm"
            className="rounded-xl"
            onClick={() => {
              setReminderText(drop.suggestedReminder!.text);
              setReminderAt(drop.suggestedReminder?.at ?? null);
              setReminderOpen(true);
            }}
          >
            Set reminder
          </Button>
        </div>
      )}

      {/* Structured info */}
      {(drop.product || drop.place || drop.event || drop.receipt || drop.reservation || drop.flight) && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Understood</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {drop.product && (
              <InfoCard title="Product" emoji="🛍️">
                <InfoRow k="Name" v={drop.product.name} />
                <InfoRow k="Brand" v={drop.product.brand} />
                <InfoRow k="Price" v={formatPrice(drop.product.price, drop.product.currency)} />
                <InfoRow k="Store" v={drop.product.store} />
                <InfoRow k="Color" v={drop.product.color} />
                <InfoRow k="Size" v={drop.product.size} />
              </InfoCard>
            )}
            {drop.place && (
              <InfoCard title="Place" emoji="📍">
                <InfoRow k="Name" v={drop.place.name} />
                <InfoRow k="City" v={drop.place.city} />
                <InfoRow k="Country" v={drop.place.country} />
                <InfoRow k="Address" v={drop.place.address} />
                <InfoRow k="Type" v={drop.place.category} />
              </InfoCard>
            )}
            {drop.flight && (
              <InfoCard title="Flight" emoji="✈️">
                <InfoRow k="Airline" v={drop.flight.airline} />
                <InfoRow k="Flight" v={drop.flight.flightNumber} />
                <InfoRow k="Route" v={[drop.flight.departure, drop.flight.destination].filter(Boolean).join(" → ")} />
                {drop.flight.departureTime && <InfoRow k="Departure" v={formatDateTime(drop.flight.departureTime)} />}
                <InfoRow k="Booking ref" v={drop.flight.bookingReference} />
              </InfoCard>
            )}
            {drop.event && (
              <InfoCard title="Event" emoji="📅">
                <InfoRow k="Name" v={drop.event.name} />
                {drop.event.startTime && <InfoRow k="When" v={formatDateTime(drop.event.startTime)} />}
                <InfoRow k="Where" v={drop.event.location} />
              </InfoCard>
            )}
            {drop.receipt && (
              <InfoCard title="Receipt" emoji="🧾">
                <InfoRow k="Merchant" v={drop.receipt.merchant} />
                <InfoRow k="Total" v={formatPrice(drop.receipt.total, drop.receipt.currency)} />
                <InfoRow k="Order" v={drop.receipt.orderNumber} />
                {drop.receipt.returnDeadline && <InfoRow k="Return by" v={formatDate(drop.receipt.returnDeadline)} />}
              </InfoCard>
            )}
            {drop.reservation && (
              <InfoCard title="Reservation" emoji="🔖">
                <InfoRow k="Type" v={drop.reservation.type} />
                <InfoRow k="Provider" v={drop.reservation.provider} />
                <InfoRow k="Reference" v={drop.reservation.reference} />
                {drop.reservation.startTime && <InfoRow k="When" v={formatDateTime(drop.reservation.startTime)} />}
                <InfoRow k="Where" v={drop.reservation.location} />
              </InfoCard>
            )}
          </div>
        </section>
      )}

      {/* Entities */}
      {entityGroups.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Extracted</h2>
          <div className="flex flex-wrap gap-2">
            {entityGroups.map((g) => (
              <span key={g.label} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs">
                <span className="font-bold text-muted-foreground">{g.label}:</span>
                {g.values.slice(0, 4).map((v, i) => (
                  <span key={i} className="font-semibold">
                    {v}
                    {i < Math.min(g.values.length, 4) - 1 ? "," : ""}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Tags */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          <Tag className="h-3.5 w-3.5" /> Tags
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {drop.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold">
              #{t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => void removeTag({ id: drop._id, tag: t })} className="cursor-pointer text-muted-foreground hover:text-destructive">
                ×
              </button>
            </span>
          ))}
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (newTag.trim()) {
                void addTag({ id: drop._id, tag: newTag.trim() });
                setNewTag("");
              }
            }}
          >
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="+ add tag"
              className="h-8 w-32 rounded-full px-3 text-xs"
            />
          </form>
        </div>
      </section>

      {/* Reminders */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Bell className="h-3.5 w-3.5" /> Reminders
          </h2>
          <Button variant="ghost" size="sm" className="gap-1.5 text-primary" onClick={() => setReminderOpen(true)}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {reminders && reminders.length > 0 ? (
          <div className="space-y-2">
            {reminders.map((r) => (
              <div key={r._id} className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5">
                <Bell className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{r.text}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(r.remindAt)}</p>
                </div>
                {r.status === "pending" ? (
                  <Button variant="outline" size="sm" onClick={() => void completeReminder({ id: r._id })}>
                    Done
                  </Button>
                ) : (
                  <span className="text-xs font-semibold text-muted-foreground capitalize">{r.status}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No reminders yet.</p>
        )}
      </section>

      {/* Collections */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          <FolderPlus className="h-3.5 w-3.5" /> Collections
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {(dropCollections ?? []).map((c) => (
            <button
              key={c._id}
              type="button"
              onClick={() => void removeFromCollection({ collectionId: c._id, dropId: drop._id })}
              className="cursor-pointer rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
            >
              {c.emoji ?? "📁"} {c.name} ✕
            </button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-full">
                <FolderPlus className="h-3.5 w-3.5" /> Add to collection
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 rounded-2xl p-2" align="start">
              <div className="space-y-1">
                {(collections ?? []).map((c) => (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => void addToCollection({ collectionId: c._id, dropId: drop._id })}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span>{c.emoji ?? "📁"}</span>
                    <span className="flex-1 truncate font-medium">{c.name}</span>
                    {dropCollections?.some((dc) => dc._id === c._id) && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
                <form
                  className="flex gap-1.5 border-t border-border pt-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newCollectionName.trim()) return;
                    const id = await createCollection({ name: newCollectionName.trim() });
                    await addToCollection({ collectionId: id as never, dropId: drop._id });
                    setNewCollectionName("");
                    toast("Collection created");
                  }}
                >
                  <Input
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="New collection…"
                    className="h-8 text-xs"
                  />
                  <Button size="sm" className="h-8">Add</Button>
                </form>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </section>

      {/* Retry analysis */}
      {(drop.status === "failed" || drop.status === "needs_review") && (
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => {
            void retryAnalysis({ id: drop._id });
            toast("Re-analyzing your Drop…");
          }}
        >
          <RefreshCw className="h-4 w-4" /> Help DROP understand this
        </Button>
      )}

      {/* Related */}
      {related.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Related Drops
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {related.map((r, i) => (
              <DropCard key={r._id} drop={r} index={i} />
            ))}
          </div>
        </section>
      )}

      <p className="pb-2 text-center text-xs text-muted-foreground">
        <Lock className="mr-1 inline h-3 w-3" /> Your Drops are private. Always.
      </p>

      <ReminderDialog
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        dropId={drop._id}
        text={reminderText}
        setText={setReminderText}
        at={reminderAt}
        setAt={setReminderAt}
        onCreate={(t, a) => createReminder({ dropId: drop._id, text: t, remindAt: a })}
      />
    </div>
  );
}

function SparkleIcon() {
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-lg">💡</span>;
}

function InfoCard({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4">
      <p className="mb-2.5 text-sm font-bold tracking-tight">
        {emoji} {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function InfoRow({ k, v }: { k: string; v?: string | number | null }) {
  if (v === undefined || v === null || v === "") return null;
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="truncate font-semibold">{v}</span>
    </div>
  );
}

function ReminderDialog({
  open,
  onOpenChange,
  dropId,
  text,
  setText,
  at,
  setAt,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dropId: string;
  text: string;
  setText: (t: string) => void;
  at: number | null;
  setAt: (t: number | null) => void;
  onCreate: (t: string, at: number) => Promise<unknown>;
}) {
  const day = 86400000;
  const presets = [
    { label: "Tomorrow, 9 AM", at: (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); })() },
    { label: "In 2 days", at: Date.now() + 2 * day },
    { label: "Next week", at: Date.now() + 7 * day },
    { label: "Before this event", at: at ?? Date.now() + day },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle className="tracking-tight">Remind me</DialogTitle>
          <DialogDescription>
            Natural language works too — “two days before”.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Remind me about this before the return period ends"
          />
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setText(text || p.label);
                  setAt(p.at);
                }}
                className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:border-primary/40"
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            onChange={(e) => e.target.value && setAt(new Date(e.target.value).getTime())}
          />
        </div>
        <DialogFooter>
          <Button
            disabled={!text.trim() || !at}
            onClick={async () => {
              if (!at) return;
              await onCreate(text.trim(), at);
              onOpenChange(false);
              toast("Reminder set");
            }}
          >
            <Bell className="mr-2 h-4 w-4" /> Set reminder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
