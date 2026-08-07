import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Loader2, MapPin, Navigation } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "Restaurant", label: "🍽️ Restaurants" },
  { id: "Hotel", label: "🏨 Hotels" },
  { id: "Shop", label: "🛍️ Shops" },
  { id: "Attraction", label: "🏛️ Activities" },
  { id: "Travel", label: "✈️ Travel" },
];

const PLACE_EMOJI: Record<string, string> = {
  Restaurant: "🍝",
  Hotel: "🏨",
  Shop: "🛍️",
  Attraction: "🏛️",
  Cafe: "☕",
  Other: "📍",
};

export default function Places() {
  const places = useQuery(api.drops.places);
  const [filter, setFilter] = useState("all");
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (!places) return [];
    if (filter === "all") return places;
    if (filter === "Travel") return places.filter((d) => d.place?.country || d.place?.city);
    return places.filter((d) => d.place?.category === filter);
  }, [places, filter]);

  if (!places) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const mapsQuery = (drop: (typeof places)[number]) => {
    const name = drop.place?.name ?? drop.title;
    const city = drop.place?.city ? `, ${drop.place.city}` : "";
    const country = drop.place?.country ? `, ${drop.place.country}` : "";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + city + country)}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <MapPin className="h-6 w-6 text-primary" /> Saved Places
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every place you've dropped — restaurants, hotels, shops and more.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === f.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-bold tracking-tight">No places here yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Save a restaurant, hotel or attraction and DROP will file it under Places automatically.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((drop, i) => (
            <div
              key={drop._id}
              className="group flex items-center gap-4 rounded-2xl border border-border/80 bg-card p-4 transition-all hover:border-primary/30"
            >
              <button
                type="button"
                onClick={() => navigate(`/app/drop/${drop._id}`)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 text-left"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-2xl">
                  {PLACE_EMOJI[drop.place?.category ?? "Other"] ?? "📍"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-bold tracking-tight">
                    {drop.place?.name ?? drop.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{drop.place?.category ?? "Place"}</span>
                    {drop.place?.city && <span>· {drop.place.city}</span>}
                    {drop.place?.country && <span>· {drop.place.country}</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground/80">
                    {drop.place?.address}
                  </span>
                </span>
              </button>
              <a
                href={mapsQuery(drop)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                aria-label="Open in Maps"
              >
                <Navigation className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
