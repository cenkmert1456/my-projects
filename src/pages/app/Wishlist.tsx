import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useQuery } from "convex/react";
import { Heart, Loader2 } from "lucide-react";
import { useNavigate } from "react-router";
import { formatDate, formatPrice } from "@/lib/format";

export default function Wishlist() {
  const wishlist = useQuery(api.drops.wishlist);
  const navigate = useNavigate();

  if (!wishlist) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Heart className="h-6 w-6 fill-primary text-primary" /> Wishlist
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every product you've saved, gathered in one place — automatically.
        </p>
      </div>

      {wishlist.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
          <Heart className="h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-bold tracking-tight">Your wishlist is empty</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Save any product — shoes, laptops, headphones — and DROP tracks it here.
          </p>
          <Button className="mt-4 rounded-2xl" onClick={() => navigate("/app")}>
            Drop a product
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {wishlist.map((drop) => (
            <button
              key={drop._id}
              type="button"
              onClick={() => navigate(`/app/drop/${drop._id}`)}
              className="flex cursor-pointer items-center gap-4 rounded-2xl border border-border/80 bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-2xl">
                {drop.product?.category === "Shoes" ? "👟" : drop.product?.category === "Electronics" ? "🎧" : "🛍️"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold tracking-tight">
                  {drop.product?.name ?? drop.title}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  {drop.product?.brand && <span>{drop.product.brand}</span>}
                  {drop.product?.store && <span>· {drop.product.store}</span>}
                  {drop.product?.color && <span>· {drop.product.color}</span>}
                  <span>· saved {formatDate(drop.savedAt)}</span>
                </span>
              </span>
              <span className="shrink-0 text-lg font-extrabold tracking-tight text-primary">
                {formatPrice(drop.product?.price, drop.product?.currency)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
