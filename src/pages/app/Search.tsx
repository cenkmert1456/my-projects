import { api } from "@/convex/_generated/api";
import { DropCard } from "@/components/drops/DropCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction, useQuery } from "convex/react";
import { Loader2, Search as SearchIcon, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { cn } from "@/lib/utils";
import { CATEGORY_META } from "@/lib/drop-meta";
import type { Doc } from "@/convex/_generated/dataModel";

const QUICK_FILTERS = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "screenshots", label: "📸 Screenshots" },
  { id: "links", label: "🔗 Links" },
  { id: "products", label: "🛍️ Products" },
  { id: "places", label: "📍 Places" },
  { id: "travel", label: "✈️ Travel" },
  { id: "receipts", label: "🧾 Receipts" },
];

const EXAMPLES = [
  "black shoes I saved",
  "hotels I saved for Tokyo",
  "restaurants in Rome",
  "movie my friend recommended",
  "laptop under €1000",
  "what I saved from Instagram last month",
];

type SearchHit = {
  drop: Doc<"drops">;
  score: number;
  matched: string[];
  semantic: boolean;
};

export default function Search() {
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [quick, setQuick] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const searchDrops = useAction(api.search.searchDrops);
  const recentSearches = useQuery(api.searchHistory.list, { limit: 8 });
  const debounceRef = useRef<number | null>(null);
  const navigate = useNavigate();

  const runSearch = async (q: string) => {
    if (!q.trim()) {
      setHits(null);
      setCount(0);
      return;
    }
    setLoading(true);
    try {
      const day = 86400000;
      const now = Date.now();
      const res = await searchDrops({
        query: q,
        filters: {
          limit: 24,
          ...(category ? { category } : {}),
          ...(quick === "today" ? { dateFrom: new Date(now).setHours(0, 0, 0, 0) } : {}),
          ...(quick === "week" ? { dateFrom: now - 7 * day } : {}),
          ...(quick === "screenshots" ? { kind: "screenshot" } : {}),
          ...(quick === "links" ? { kind: "link" } : {}),
          ...(quick === "products" ? { category: "Products" } : {}),
          ...(quick === "places" ? { category: "Places" } : {}),
          ...(quick === "travel" ? { category: "Travel" } : {}),
          ...(quick === "receipts" ? { category: "Receipts" } : {}),
        },
      });
      setHits(res.results as SearchHit[]);
      setCount(res.count);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void runSearch(query);
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, quick, category]);

  const hasQuery = query.trim().length > 0;
  const showExamples = !hasQuery && !loading && (!hits || hits.length === 0);

  const categoryChips = useMemo(
    () =>
      Object.entries(CATEGORY_META).filter(
        ([name]) =>
          name !== "Other" &&
          ["Products", "Places", "Travel", "Food", "Entertainment", "Receipts", "Events", "Ideas", "Tickets"].includes(name),
      ),
    [],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Search your memory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vague is fine. DROP searches meaning, not just words.
        </p>
      </div>

      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(query);
        }}
      >
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask DROP anything…"
          className="h-13 rounded-2xl py-3.5 pl-11 pr-12 text-[15px]"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {/* Quick filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {QUICK_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setQuick(quick === f.id ? null : f.id)}
            className={cn(
              "shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              quick === f.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        {categoryChips.map(([name, meta]) => (
          <button
            key={name}
            type="button"
            onClick={() => setCategory(category === name ? null : name)}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              category === name
                ? "border-primary bg-primary text-primary-foreground"
                : cn("border-border", meta.chip),
            )}
          >
            {meta.emoji} {name}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Searching your memory…
        </div>
      )}

      {!loading && hits && hits.length > 0 && (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            {count} result{count !== 1 ? "s" : ""} — {hits.filter((h) => h.semantic).length} matched
            by meaning
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {hits.map((hit, i) => (
              <DropCard key={hit.drop._id} drop={hit.drop} index={i} />
            ))}
          </div>
        </div>
      )}

      {!loading && hasQuery && hits && hits.length === 0 && (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
          <SearchIcon className="h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-bold tracking-tight">Nothing found</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Try different words, or ask DROP directly — it can compare and reason over what you saved.
          </p>
          <Button
            className="mt-4 gap-2 rounded-2xl"
            onClick={() => navigate(`/app/ask?q=${encodeURIComponent(query)}`)}
          >
            <Sparkles className="h-4 w-4" />
            Ask DROP
          </Button>
        </div>
      )}

      {showExamples && (
        <div className="space-y-4">
          {recentSearches && recentSearches.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Recent searches
              </p>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((s) => (
                  <button
                    key={s._id}
                    type="button"
                    onClick={() => {
                      setQuery(s.query);
                      setParams({ q: s.query });
                    }}
                    className="cursor-pointer rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  >
                    {s.query}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Try asking
            </p>
            <div className="space-y-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setQuery(ex);
                    setParams({ q: ex });
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-2xl border border-border/80 bg-card px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                  “{ex}”
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
