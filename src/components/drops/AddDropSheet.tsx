import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import {
  Camera,
  FileUp,
  ImagePlus,
  Link2,
  Loader2,
  Sparkles,
  StickyNote,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { urlLabel } from "@/lib/format";

export type DropKindOption = "screenshot" | "image" | "link" | "note" | "document";

const OPTIONS: Array<{
  kind: DropKindOption;
  label: string;
  hint: string;
  icon: typeof Camera;
}> = [
  { kind: "screenshot", label: "Screenshot", hint: "From your device", icon: Camera },
  { kind: "image", label: "Photo", hint: "JPG, PNG, HEIC…", icon: ImagePlus },
  { kind: "link", label: "Link", hint: "Paste a URL", icon: Link2 },
  { kind: "note", label: "Note", hint: "Quick thought", icon: StickyNote },
  { kind: "document", label: "Document", hint: "PDF, DOCX…", icon: FileUp },
];

export function AddDropSheet({
  open,
  onOpenChange,
  initialKind = "screenshot",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKind?: DropKindOption;
}) {
  const [mode, setMode] = useState<"choose" | "link" | "note" | "uploading">("choose");
  const [kind, setKind] = useState<DropKindOption>(initialKind);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ dropId: string; title: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const generateUploadUrl = useMutation(api.drops.generateUploadUrl);
  const create = useMutation(api.drops.create);
  const { isAuthenticated } = useAuth();
  const plan = useQuery(api.profile.planInfo);

  useEffect(() => {
    if (open) {
      setMode("choose");
      setKind(initialKind);
      setUrl("");
      setNote("");
      setError(null);
      setDuplicate(null);
    }
  }, [open, initialKind]);

  const close = () => onOpenChange(false);

  // Clipboard paste detection: if the clipboard holds an image or a URL,
  // DROP detects it automatically.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file, file.type.startsWith("image") ? "screenshot" : "document");
            return;
          }
        }
      }
      const text = e.clipboardData?.getData("text") ?? "";
      if (/^https?:\/\/\S+$/i.test(text.trim())) {
        e.preventDefault();
        setKind("link");
        setUrl(text.trim());
        setMode("link");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  const handleFile = async (file: File, fileKind: DropKindOption) => {
    if (!isAuthenticated) return;
    setError(null);
    setDuplicate(null);
    setUploading(true);
    setMode("uploading");
    try {
      const storageUrl = await generateUploadUrl();
      const res = await fetch(storageUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed — please try again.");
      const storageId = storageUrl.split("/").pop() ?? "";
      const result = await create({
        kind: fileKind,
        storageId,
        contentType: file.type,
        fileName: file.name,
      });
      handleResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Your file was not lost — try again.");
      setMode("choose");
      setUploading(false);
    }
  };

  const handleResult = (result: { duplicate?: boolean; dropId: string; title?: string }) => {
    setUploading(false);
    if (result.duplicate && result.dropId) {
      setDuplicate({ dropId: result.dropId, title: result.title ?? "" });
      setMode("choose");
      toast("You already saved this", {
        description: "DROP remembers duplicates so your memory stays clean.",
      });
      return;
    }
    toast("Dropped ✓", {
      description: "Saved instantly. DROP is understanding it now…",
    });
    close();
    navigate(`/app/drop/${result.dropId}`);
  };

  const handleCreateLink = async () => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      setError("That doesn't look like a link. Try something like https://…");
      return;
    }
    setError(null);
    setUploading(true);
    setMode("uploading");
    try {
      const result = await create({ kind: "link", url: trimmed, source: sourceFromUrl(trimmed) });
      handleResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that link.");
      setMode("link");
      setUploading(false);
    }
  };

  const handleCreateNote = async () => {
    if (!note.trim()) return;
    setError(null);
    setUploading(true);
    setMode("uploading");
    try {
      const result = await create({ kind: "note", text: note.trim() });
      handleResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that note.");
      setMode("note");
      setUploading(false);
    }
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = e.dataTransfer.files;
      if (files.length) {
        const file = files[0];
        const isDoc = /pdf|word|text|document/i.test(file.type);
        handleFile(file, isDoc ? "document" : "image");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const planBlocked = plan && !plan.isUnlimited && (plan.dropCount ?? 0) >= (plan.dropLimit ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/70 px-6 py-5 text-left">
          <DialogTitle className="text-lg tracking-tight">Drop Something</DialogTitle>
          <DialogDescription className="text-sm">
            Save anything. DROP figures out the rest.
          </DialogDescription>
        </DialogHeader>

        {planBlocked && (
          <div className="mx-6 mt-4 rounded-2xl border border-primary/30 bg-accent/60 px-4 py-3 text-sm">
            <span className="font-semibold text-accent-foreground">
              You've reached your free limit.
            </span>{" "}
            <span className="text-muted-foreground">
              Upgrade to DROP Pro for unlimited Drops.
            </span>
          </div>
        )}

        {mode === "choose" && (
          <div className="px-6 py-5">
            {duplicate && (
              <div className="mb-4 rounded-2xl border border-border bg-muted/50 p-4">
                <p className="text-sm font-semibold">You already saved this.</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  “{duplicate.title}” is in your memory.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      close();
                      navigate(`/app/drop/${duplicate.dropId}`);
                    }}
                  >
                    View existing
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={async () => {
                      try {
                        const result = await create({
                          kind: "link",
                          url: url.trim() || undefined,
                          saveAnyway: true,
                        });
                        if (result.duplicate === false) {
                          toast("Dropped ✓");
                          close();
                          navigate(`/app/drop/${result.dropId}`);
                        }
                      } catch {
                        toast("Could not save");
                      }
                    }}
                  >
                    Save anyway
                  </Button>
                </div>
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors",
                dragging
                  ? "border-primary bg-accent/60"
                  : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/60",
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                {dragging ? (
                  <UploadCloud className="h-6 w-6" />
                ) : (
                  <Sparkles className="h-6 w-6" />
                )}
              </div>
              <p className="mt-3 text-sm font-semibold">
                {dragging ? "Release to drop it" : "Drag & drop anything"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                or paste from clipboard — DROP detects images & links
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file, /pdf|word|text/i.test(file.type) ? "document" : "image");
                  e.target.value = "";
                }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {OPTIONS.map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => {
                    setKind(opt.kind);
                    if (opt.kind === "link") setMode("link");
                    else if (opt.kind === "note") setMode("note");
                    else fileInputRef.current?.click();
                  }}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition-all hover:border-primary/40 hover:bg-accent/40 active:scale-[0.98]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                    <opt.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold leading-tight">
                      {opt.label}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {opt.hint}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </div>
        )}

        {mode === "link" && (
          <div className="space-y-4 px-6 py-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Paste a link</label>
              <Input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateLink();
                }}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Works with Instagram, TikTok, YouTube, shops, articles — anything.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode("choose")}>
                Back
              </Button>
              <Button className="flex-[2]" onClick={handleCreateLink} disabled={!url.trim()}>
                <Link2 className="mr-2 h-4 w-4" />
                Save link
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {mode === "note" && (
          <div className="space-y-4 px-6 py-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Write it down</label>
              <Textarea
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="A thought, a deal, an idea, a memory…"
                rows={5}
                className="resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode("choose")}>
                Back
              </Button>
              <Button className="flex-[2]" onClick={handleCreateNote} disabled={!note.trim()}>
                <StickyNote className="mr-2 h-4 w-4" />
                Save note
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {mode === "uploading" && (
          <div className="flex flex-col items-center px-6 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm font-semibold">Dropping your {url ? "link" : "file"}…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {url ? urlLabel(url) : "This usually takes a second"}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function sourceFromUrl(url: string): string | undefined {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  if (/instagram/.test(host)) return "instagram";
  if (/tiktok/.test(host)) return "tiktok";
  if (/youtu/.test(host)) return "youtube";
  if (/twitter|x\.com/.test(host)) return "x";
  if (/pinterest/.test(host)) return "pinterest";
  if (/reddit/.test(host)) return "web";
  if (host) return "web";
  return undefined;
}
