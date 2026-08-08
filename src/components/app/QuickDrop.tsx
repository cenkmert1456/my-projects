import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { dropService, storageService } from "@/lib/services";
import { authErrorMessage } from "@/lib/supabase/auth-errors";
import { ImagePlus, Link2, Loader2, Sparkles, StickyNote } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

/** Cmd/Ctrl+Shift+D — capture something in under 3 seconds. */
export function QuickDrop({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [text, setText] = useState("");
  const [clipImage, setClipImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const userId = user?.id;

  const reset = () => {
    setText("");
    setClipImage(null);
    setBusy(false);
  };

  // Detect clipboard content (URL or image) when the sheet opens.
  useEffect(() => {
    if (!open) return;
    reset();
    const detect = async () => {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const image = item.types.find((t) => t.startsWith("image/"));
          if (image) {
            const blob = await item.getType(image);
            if (blob) setClipImage(URL.createObjectURL(blob));
            break;
          }
        }
      } catch {
        // clipboard read not permitted — paste still works via the input
      }
      try {
        const t = await navigator.clipboard.readText();
        if (/^https?:\/\/\S+$/i.test(t.trim()) && !text) {
          setText(t.trim());
        }
      } catch {
        // ignore
      }
    };
    void detect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const upload = async (file: File) => {
    if (!isAuthenticated || !userId) return;
    setBusy(true);
    try {
      const path = await storageService.uploadFile({
        userId,
        dropId: "pending",
        file,
        fileName: file.name || "capture.bin",
        contentType: file.type || "application/octet-stream",
      });
      const kind = file.type.startsWith("image/") ? "screenshot" : "document";
      const result = await dropService.create(userId, {
        kind,
        storagePath: path,
        contentType: file.type,
        fileName: file.name,
      });
      toast("Dropped ✓", { description: "Saved instantly — DROP is understanding it…" });
      onOpenChange(false);
      navigate(`/app/drop/${result.dropId}`);
    } catch (err) {
      toast("Couldn't save that", { description: authErrorMessage(err, "Please try again.") });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const t = text.trim();
    if (!t || busy || !userId) return;
    setBusy(true);
    try {
      if (/^https?:\/\/\S+$/i.test(t)) {
        const result = await dropService.create(userId, { kind: "link", url: t });
        toast("Dropped ✓");
        onOpenChange(false);
        navigate(`/app/drop/${result.dropId}`);
      } else {
        const result = await dropService.create(userId, { kind: "note", text: t });
        toast("Dropped ✓");
        onOpenChange(false);
        navigate(`/app/drop/${result.dropId}`);
      }
    } catch {
      toast("Couldn't save that");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden rounded-3xl p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base tracking-tight">
            <Sparkles className="h-4 w-4 text-primary" /> Quick Drop
          </DialogTitle>
          <DialogDescription className="text-xs">
            Paste a link, a screenshot, or write a thought. Saved in seconds.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-6 py-5">
          {clipImage && (
            <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-accent/50 p-3">
              <img src={clipImage} alt="Clipboard" className="h-14 w-14 rounded-xl object-cover" />
              <div className="flex-1">
                <p className="text-sm font-semibold">Drop clipboard image?</p>
                <p className="text-xs text-muted-foreground">We detected an image in your clipboard.</p>
              </div>
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  try {
                    const blob = await (await fetch(clipImage)).blob();
                    const file = new File([blob], "clipboard.png", { type: "image/png" });
                    await upload(file);
                  } catch {
                    toast("Couldn't read the clipboard image");
                  }
                }}
              >
                <ImagePlus className="mr-1.5 h-4 w-4" /> Drop it
              </Button>
            </div>
          )}

          <div className="relative">
            <Input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
              }}
              placeholder="Paste a link or write a thought…"
              className="rounded-2xl py-3 pr-10"
            />
            {/^https?:\/\/\S+$/i.test(text.trim()) ? (
              <Link2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            ) : (
              <StickyNote className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" className="flex-1 gap-1.5 rounded-xl" onClick={() => inputRef.current?.click()} disabled={busy}>
              <ImagePlus className="h-4 w-4" /> Upload file
            </Button>
            <Button className="flex-[2] gap-1.5 rounded-xl" onClick={() => void save()} disabled={!text.trim() || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
