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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeQuery } from "@/hooks/use-realtime-query";
import { stackService } from "@/lib/services";
import { Layers, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Stacks() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const { data: stacks, loading } = useRealtimeQuery(
    () => stackService.list(uid as string),
    { table: "stacks", userId: uid },
  );
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !uid) return;
    setSaving(true);
    try {
      const created = await stackService.create(uid, {
        name,
        emoji: emoji.trim() || undefined,
        description: description.trim() || undefined,
      });
      toast(`Stack “${name.trim()}” created`);
      setOpen(false);
      setName("");
      setEmoji("");
      setDescription("");
      navigate(`/app/stacks/${created.id}`);
    } catch {
      toast("Couldn't create the stack");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !stacks) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Layers className="h-6 w-6 text-primary" /> Stacks
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Active research groups — the things you're working on right now.
          </p>
        </div>
        <Button className="gap-2 rounded-2xl font-semibold" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" strokeWidth={3} /> New stack
        </Button>
      </div>

      {stacks.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <span className="text-4xl">🗂️</span>
          <h3 className="mt-4 text-lg font-bold tracking-tight">No stacks yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Stacks group the Drops you're actively researching — a trip you're
            planning, a laptop you're comparing, a renovation moodboard.
          </p>
          <Button className="mt-5 gap-2 rounded-2xl" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Create your first stack
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stacks.map(({ stack, count, drops }) => (
            <button
              key={stack._id}
              type="button"
              onClick={() => navigate(`/app/stacks/${stack._id}`)}
              className="group cursor-pointer rounded-3xl border border-border/80 bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="flex items-start justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-2xl">
                  {stack.emoji ?? "🗂️"}
                </span>
                <button
                  type="button"
                  aria-label="Delete stack"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(stack._id);
                  }}
                  className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 font-bold tracking-tight">{stack.name}</p>
              {stack.description && (
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {stack.description}
                </p>
              )}
              <p className="mt-2 text-xs font-semibold text-primary">
                {count} drop{count !== 1 ? "s" : ""}
              </p>
              {drops.length > 0 && (
                <div className="mt-3 flex items-center gap-1.5">
                  {drops.map((d) => (
                    <span
                      key={d._id}
                      className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/50 text-xs"
                      title={d.title}
                    >
                      {d.kind === "screenshot" || d.kind === "image" ? "🖼️" : d.kind === "link" ? "🔗" : "📄"}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="tracking-tight">New stack</DialogTitle>
            <DialogDescription>
              A stack is a research group — “Japan 2027”, “New Gaming PC”, “Wedding ideas”.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="🗼"
                maxLength={4}
                className="w-16 text-center text-lg"
                aria-label="Emoji"
              />
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Stack name"
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && void submit()}
              />
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you researching? (optional)"
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || saving}
              className="rounded-xl font-semibold"
              onClick={() => void submit()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create stack"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="tracking-tight">Delete this stack?</DialogTitle>
            <DialogDescription>
              The Drops inside stay in your library — only the stack is removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Keep stack
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={async () => {
                if (confirmDelete) await stackService.remove(uid as string, confirmDelete);
                toast("Stack deleted");
                setConfirmDelete(null);
              }}
            >
              Delete stack
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
