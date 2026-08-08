import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import { Bell, Check, Loader2, Pin, RotateCcw, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface ActionItem {
  key: string;
  kind: "review" | "return" | "upcoming" | "reminder" | "pinned";
  emoji: string;
  title: string;
  detail: string;
  dropId?: string;
  cta?: { label: string; onClick: () => void };
  onDone?: () => void;
  onDismiss?: () => void;
}

export default function Actions() {
  const all = useQuery(api.drops.listAll, {});
  const reminders = useQuery(api.reminders.listUpcoming);
  const retryAnalysis = useMutation(api.drops.retryAnalysis);
  const completeReminder = useMutation(api.reminders.complete);
  const dismissReminder = useMutation(api.reminders.dismiss);
  const toggleArchive = useMutation(api.drops.toggleArchive);
  const [done, setDone] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const items = useMemo<ActionItem[]>(() => {
    const out: ActionItem[] = [];
    const drops = (all ?? []) as Doc<"drops">[];
    const now = Date.now();
    const day = 86400000;

    // 1. Drops that need a human look.
    for (const d of drops) {
      if (d.status === "failed") {
        out.push({
          key: `fail-${d._id}`,
          kind: "review",
          emoji: "⚠️",
          title: "DROP couldn't analyze this",
          detail: `“${d.title}” — the file is safe in your library.`,
          dropId: d._id.toString(),
          cta: {
            label: "Try analysis again",
            onClick: () => void retryAnalysis({ id: d._id }),
          },
        });
      } else if (d.status === "needs_review") {
        out.push({
          key: `review-${d._id}`,
          kind: "review",
          emoji: "👀",
          title: "Needs your eyes",
          detail: `“${d.title}” was saved ${timeAgo(d.savedAt)} — DROP is unsure about a few details.`,
          dropId: d._id.toString(),
        });
      }
    }

    // 2. Return deadlines closing in.
    for (const d of drops) {
      const dl = d.receipt?.returnDeadline;
      if (dl && dl > now && dl < now + 14 * day) {
        const days = Math.ceil((dl - now) / day);
        out.push({
          key: `return-${d._id}`,
          kind: "return",
          emoji: "🧾",
          title: `Return window closes ${days === 1 ? "tomorrow" : `in ${days} days`}`,
          detail: `“${d.title}” — return by ${formatDateTime(dl)}.`,
          dropId: d._id.toString(),
          onDone: () => void toggleArchive({ id: d._id }),
        });
      }
    }

    // 3. Upcoming plans in the next 30 days.
    for (const d of drops) {
      const when = d.event?.startTime ?? d.reservation?.startTime ?? d.flight?.departureTime;
      if (when && when > now - 3600000 && when < now + 30 * day) {
        const days = Math.max(0, Math.round((when - now) / day));
        out.push({
          key: `upcoming-${d._id}`,
          kind: "upcoming",
          emoji: d.flight ? "✈️" : d.event ? "🎟️" : "🔖",
          title: days === 0 ? "Happening today" : days === 1 ? "Tomorrow" : `In ${days} days`,
          detail: `“${d.title}” — ${formatDateTime(when)}.`,
          dropId: d._id.toString(),
        });
      }
    }

    // 4. Pending reminders.
    for (const r of reminders ?? []) {
      out.push({
        key: `reminder-${r._id}`,
        kind: "reminder",
        emoji: "⏰",
        title: r.text,
        detail: r.dropTitle ? `“${r.dropTitle}” · ${formatDateTime(r.remindAt)}` : formatDateTime(r.remindAt),
        dropId: r.dropId?.toString(),
        onDone: () => void completeReminder({ id: r._id }),
        onDismiss: () => void dismissReminder({ id: r._id }),
      });
    }

    // 5. Pinned Drops — quick access.
    for (const d of drops) {
      if (d.pinned) {
        out.push({
          key: `pinned-${d._id}`,
          kind: "pinned",
          emoji: "📌",
          title: d.title,
          detail: `${d.category} · pinned ${timeAgo(d.savedAt)}`,
          dropId: d._id.toString(),
        });
      }
    }

    return out;
  }, [all, reminders, retryAnalysis, completeReminder, dismissReminder, toggleArchive]);

  if (!all || !reminders) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const visible = items.filter((i) => !done.has(i.key));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sparkles className="h-6 w-6 text-primary" /> Action Center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Things worth your attention — deadlines, reminders and Drops waiting for a look.
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <span className="text-4xl">🧘</span>
          <h3 className="mt-4 text-lg font-bold tracking-tight">All clear</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            No deadlines closing, no reminders pending. DROP will bring things here
            the moment there's something worth doing.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-4 rounded-2xl border border-border/80 bg-card p-4 transition-all hover:border-primary/25"
            >
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl",
                  item.kind === "return"
                    ? "bg-amber-500/12"
                    : item.kind === "upcoming"
                      ? "bg-sky-500/12"
                      : item.kind === "reminder"
                        ? "bg-rose-500/12"
                        : item.kind === "pinned"
                          ? "bg-violet-500/12"
                          : "bg-muted",
                )}
              >
                {item.emoji}
              </span>
              <button
                type="button"
                onClick={() => item.dropId && navigate(`/app/drop/${item.dropId}`)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-bold tracking-tight">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
              </button>
              <div className="flex shrink-0 items-center gap-1.5">
                {item.cta && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-xl"
                    onClick={item.cta.onClick}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> {item.cta.label}
                  </Button>
                )}
                {item.onDone && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Done"
                    className="text-muted-foreground hover:text-primary"
                    onClick={() => {
                      item.onDone?.();
                      setDone((s) => new Set(s).add(item.key));
                    }}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                )}
                {item.onDismiss && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Dismiss"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      item.onDismiss?.();
                      setDone((s) => new Set(s).add(item.key));
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Bell className="h-3.5 w-3.5" />
        Action Center surfaces real Drops from your library — nothing is invented.
      </div>
    </div>
  );
}
