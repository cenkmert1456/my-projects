import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StateError } from "@/components/app/DataStates";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeQuery } from "@/hooks/use-realtime-query";
import { useStorageUrl } from "@/hooks/use-storage-url";
import { searchService } from "@/lib/services";
import { authErrorMessage } from "@/lib/supabase/auth-errors";
import { timeAgo } from "@/lib/format";
import { KIND_META } from "@/lib/drop-meta";
import { ChevronRight, Loader2, Search as SearchIcon, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { CATEGORY_META } from "@/lib/drop-meta";
import type { SearchHit } from "@/lib/supabase/database.types";

const QUICK_FILTERS = [
  { id: "today", labelKey: "search.today" },
  { id: "week", labelKey: "search.thisWeek" },
  { id: "screenshots", labelKey: "capture.screenshot" },
  { id: "links", labelKey: "capture.link" },
  { id: "products", labelKey: "nav.wishlist" },
  { id: "places", labelKey: "nav.places" },
  { id: "travel", labelKey: "nav.upcoming" },
  { id: "receipts", labelKey: "capture.document" },
];

const EXAMPLES = [
  "black shoes I saved",
  "hotels I saved for Tokyo",
  "restaurants in Rome",
  "movie my friend recommended",
  "laptop under €1000",
  "what I saved from Instagram last month",
];

export default function Search() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [quick, setQuick] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const { data: recentSearches } = useRealtimeQuery(
    () => searchService.listSearchHistory(uid as string, 8),
    { table: "search_history", userId: uid },
  );
  const debounceRef = useRef<number | null>(null);
  const navigate = useNavigate();

  const runSearch = async (q: string) => {
    if (!q.trim() || !uid) {
      setHits(null);
      setCount(0);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const day = 86400000;
      const now = Date.now();
      const res = await searchService.searchDrops(uid, q, {
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
      });
      setHits(res.results);
      setCount(res.count);
    } catch (err) {
      setError(authErrorMessage(err, "Couldn't search right now."));
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
  }, [query, quick, category, uid]);

  const hasQuery = query.trim().length > 0;
  const showExamples = !hasQuery && !loading && (!hits || hits.length === 0) && !error;

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
        <h1 className="text-2xl font-bold tracking-tight">{t("search.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("search.subtitle")}
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
          placeholder={t("search.placeholder")}
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
            {t(f.labelKey)}
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
          {t("states.loadingMemory")}
        </div>
      )}

      {error && !loading && <StateError message={error} onRetry={() => void runSearch(query)} />}

      {!loading && hits && hits.length > 0 && (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            {count} {t("search.results")} — {hits.filter((h) => h.semantic).length} matched by meaning
          </p>
          <div className="space-y-2.5">
            {hits.map((hit) => (
              <SearchResultRow key={hit.drop._id} hit={hit} />
            ))}
          </div>
        </div>
      )}

      {!loading && hasQuery && hits && hits.length === 0 && (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
          <SearchIcon className="h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-bold tracking-tight">{t("states.noResults")}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Try different words, or ask DROP directly — it can compare and reason over what you saved.
          </p>
          <Button
            className="mt-4 gap-2 rounded-2xl"
            onClick={() => navigate(`/app/ask?q=${encodeURIComponent(query)}`)}
          >
            <Sparkles className="h-4 w-4" />
            {t("nav.ask")}
          </Button>
        </div>
      )}

      {showExamples && (
        <div className="space-y-4">
          {recentSearches && recentSearches.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("search.recent")}
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

/** Visual result row — thumbnail, title, why it matched, saved time. */
function SearchResultRow({ hit }: { hit: SearchHit }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const storageUrl = useStorageUrl(hit.drop.storagePath);
  const meta = KIND_META[hit.drop.kind];

  return (
    <button
      type="button"
      onClick={() => navigate(`/app/drop/${hit.drop._id}`)}
      className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-border/80 bg-card p-3 text-left transition-all hover:border-primary/30 active:scale-[0.99]"
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-xl">
        {storageUrl ? (
          <img src={storageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          (meta?.emoji ?? "📦")
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{hit.drop.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {hit.matched.length > 0
            ? `${t("search.matched")}: “${hit.matched.slice(0, 3).join("”, “")}”`
            : hit.drop.category}
        </span>
        <span className="block text-[11px] text-muted-foreground/70">
          {hit.drop.kind} · {timeAgo(hit.drop.savedAt)}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
