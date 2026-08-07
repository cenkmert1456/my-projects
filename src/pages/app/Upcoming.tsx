import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import { Bell, CalendarClock, Check, Loader2, X } from "lucide-react";
import { useNavigate } from "react-router";
import { formatDateTime } from "@/lib/format";

export default function Upcoming() {
  const upcoming = useQuery(api.drops.upcoming);
  const reminders = useQuery(api.reminders.listUpcoming);
  const completeReminder = useMutation(api.reminders.complete);
  const dismissReminder = useMutation(api.reminders.dismiss);
  const navigate = useNavigate();

  if (!upcoming || !reminders) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <CalendarClock className="h-6 w-6 text-primary" /> Upcoming
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Flights, events, reservations and reminders — everything that's coming up.
        </p>
      </div>

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Plans
          </h2>
          <div className="space-y-2.5">
            {upcoming.map((drop) => {
              const when = drop.event?.startTime ?? drop.reservation?.startTime;
              return (
                <button
                  key={drop._id}
                  type="button"
                  onClick={() => navigate(`/app/drop/${drop._id}`)}
                  className="flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-border/80 bg-card p-4 text-left transition-all hover:border-primary/30"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-xl">
                    {drop.event ? "🎟️" : "✈️"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold tracking-tight">{drop.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {drop.flight
                        ? `${drop.flight.departure ?? ""} → ${drop.flight.destination ?? ""}`
                        : drop.event?.location ?? drop.reservation?.location ?? drop.category}
                    </span>
                  </span>
                  {when && (
                    <span className="shrink-0 rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground">
                      {formatDateTime(when)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {reminders.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Bell className="h-3.5 w-3.5 text-primary" /> Reminders
          </h2>
          <div className="space-y-2.5">
            {reminders.map((r) => (
              <div
                key={r._id}
                className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
                  <Bell className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.text}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.dropTitle} · {formatDateTime(r.remindAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Complete"
                  onClick={() => completeReminder({ id: r._id })}
                  className="text-muted-foreground hover:text-primary"
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Dismiss"
                  onClick={() => dismissReminder({ id: r._id })}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {upcoming.length === 0 && reminders.length === 0 && (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
          <CalendarClock className="h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-bold tracking-tight">Nothing coming up</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Save a flight, event or ticket — DROP will keep it here, and can remind you before it happens.
          </p>
        </div>
      )}
    </div>
  );
}
