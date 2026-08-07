import { api } from "@/convex/_generated/api";
import { DropCard } from "@/components/drops/DropCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

export default function CollectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const data = useQuery(api.collections.get, { collectionId: id as never });
  const removeDrop = useMutation(api.collections.removeDrop);
  const updateCollection = useMutation(api.collections.update);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");

  if (!data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { collection, drops } = data;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate("/app/collections")}
        className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Collections
      </button>

      <div className="flex items-center gap-3">
        <span className="text-4xl">{collection.emoji ?? "📁"}</span>
        {editingName ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await updateCollection({ id: collection._id, patch: { name: name.trim() } });
              setEditingName(false);
              toast("Renamed");
            }}
          >
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-xl font-bold"
            />
          </form>
        ) : (
          <div>
            <button
              type="button"
              className="cursor-pointer text-2xl font-bold tracking-tight hover:underline"
              onClick={() => {
                setName(collection.name);
                setEditingName(true);
              }}
            >
              {collection.name}
            </button>
            <p className="text-sm text-muted-foreground">
              {drops.length} drop{drops.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>

      {drops.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
          <p className="text-sm text-muted-foreground">
            This collection is empty. Open any Drop and add it here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {drops.map((drop, i) => (
            <div key={drop._id} className="relative">
              <DropCard drop={drop} index={i} />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove from collection"
                onClick={async () => {
                  await removeDrop({ collectionId: collection._id, dropId: drop._id });
                  toast("Removed from collection");
                }}
                className="absolute right-2 top-2 h-7 w-7 cursor-pointer rounded-full bg-background/80 text-muted-foreground backdrop-blur hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
