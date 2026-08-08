import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "convex/react";
import {
  Camera,
  FileUp,
  ImagePlus,
  Link2,
  Loader2,
  Mic,
  Pause,
  Play,
  Square,
  StickyNote,
  UploadCloud,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isNative } from "@/lib/mobile/platform";
import {
  haptic,
  pickPhotos,
  takePhoto,
  type CapturedPhoto,
} from "@/lib/mobile/native";
import { optimizeImage, dataUrlToBlob } from "@/lib/mobile/image";
import { VoiceRecorder } from "@/lib/mobile/voice";
import type { SharePayload } from "@/components/app/AddDropContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled from an incoming share (image/text/URL). */
  share?: SharePayload | null;
  /** Opens the AddDropSheet in a specific mode (link/note/document). */
  onOpenAdvanced: (kind: "link" | "note" | "document") => void;
}

export function MobileCaptureSheet({ open, onOpenChange, share, onOpenAdvanced }: Props) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const generateUploadUrl = useMutation(api.drops.generateUploadUrl);
  const create = useMutation(api.drops.create);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [voice, setVoice] = useState<"idle" | "recording" | "paused">("idle");
  const [voiceMs, setVoiceMs] = useState(0);
  const recorderRef = useRef<VoiceRecorder | null>(null);

  useEffect(() => {
    if (open) {
      setBusy(false);
      setProgress(null);
      setVoice("idle");
      setVoiceMs(0);
    }
  }, [open]);

  const close = () => onOpenChange(false);

  // -------------------------------------------------------------------------
  // Upload pipeline (shared by all capture paths)
  // -------------------------------------------------------------------------

  const uploadFile = async (file: File | Blob, opts: { kind: "screenshot" | "image" | "document"; fileName?: string }) => {
    if (!isAuthenticated) return null;
    // Optimize images before upload (saves mobile data, faster AI).
    let body: Blob = file;
    let contentType = file.type || "application/octet-stream";
    if (file instanceof Blob && file.type.startsWith("image/")) {
      try {
        const optimized = await optimizeImage(file);
        body = optimized.blob;
        contentType = optimized.mimeType;
      } catch {
        // keep original
      }
    }
    const storageUrl = await generateUploadUrl();
    const res = await fetch(storageUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body,
    });
    if (!res.ok) throw new Error("Upload failed");
    const storageId = storageUrl.split("/").pop() ?? "";
    return create({
      kind: opts.kind,
      storageId,
      contentType,
      fileName: opts.fileName,
    });
  };

  const uploadCaptured = async (photo: CapturedPhoto) => {
    if (photo.dataUrl) {
      return uploadFile(dataUrlToBlob(photo.dataUrl), {
        kind: "screenshot",
        fileName: photo.displayName ?? "photo.jpg",
      });
    }
    if (photo.path) {
      const blob = await (await fetch(photo.path)).blob();
      return uploadFile(blob, { kind: "screenshot", fileName: photo.displayName ?? "photo.jpg" });
    }
    return null;
  };

  const finishOne = (result: { duplicate?: boolean; dropId?: string } | null, index?: number) => {
    haptic("success");
    if (result?.duplicate && result.dropId) {
      toast("You already saved this", {
        description: "DROP remembers duplicates — your memory stays clean.",
      });
      return;
    }
    toast(index !== undefined ? `Dropped item ${index + 1} ✓` : "Dropped ✓", {
      description: "Saved instantly. DROP is understanding it…",
    });
  };

  // -------------------------------------------------------------------------
  // Capture actions
  // -------------------------------------------------------------------------

  const onTakePhoto = async () => {
    haptic("light");
    setBusy(true);
    try {
      const photo = await takePhoto();
      if (photo) {
        const result = await uploadCaptured(photo);
        finishOne(result);
        close();
        if (result?.dropId && result.duplicate !== true) navigate(`/app/drop/${result.dropId}`);
      }
    } catch {
      toast("Couldn't use the camera right now");
    } finally {
      setBusy(false);
    }
  };

  const onPickPhotos = async (multiple: boolean) => {
    haptic("light");
    setBusy(true);
    try {
      const photos = await pickPhotos(multiple);
      if (photos.length === 0) return;
      setProgress({ done: 0, total: photos.length });
      const ids: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        if (!photo) continue;
        // From the native gallery the user picked real files; convert to Blob.
        let file: Blob | null = null;
        if (photo.dataUrl) file = dataUrlToBlob(photo.dataUrl);
        else if (photo.path) file = await (await fetch(photo.path)).blob();
        if (!file) continue;
        const result = await uploadFile(file, {
          kind: "screenshot",
          fileName: photo.displayName ?? `photo-${i}.jpg`,
        });
        if (result?.dropId && result.duplicate !== true) ids.push(String(result.dropId));
        setProgress({ done: i + 1, total: photos.length });
      }
      haptic("success");
      toast(photos.length > 1 ? `Dropped ${photos.length} items ✓` : "Dropped ✓", {
        description: "Saved instantly. DROP is understanding them now…",
      });
      setProgress(null);
      close();
      if (ids.length) navigate(`/app/drop/${ids[0]}`);
    } catch {
      toast("Couldn't open the gallery");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const onDocument = async () => {
    haptic("light");
    setBusy(true);
    try {
      if (isNative()) {
        const { FilePicker } = await import("@capawesome/capacitor-file-picker");
        const res = await FilePicker.pickFiles({
          limit: 1,
          types: ["application/pdf", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/*"],
        });
        const file = res.files?.[0];
        if (file?.path) {
          const blob = await (await fetch(file.path)).blob();
          const result = await uploadFile(blob, {
            kind: "document",
            fileName: file.name,
          });
          finishOne(result);
          close();
          if (result?.dropId && result.duplicate !== true) navigate(`/app/drop/${result.dropId}`);
        }
      } else {
        onOpenAdvanced("document");
        close();
      }
    } catch {
      toast("Couldn't open the file picker");
    } finally {
      setBusy(false);
    }
  };

  // -------------------------------------------------------------------------
  // Voice notes
  // -------------------------------------------------------------------------

  const toggleVoice = async () => {
    if (voice === "idle") {
      haptic("light");
      const recorder = new VoiceRecorder();
      recorderRef.current = recorder;
      recorder.onTick = (ms) => setVoiceMs(ms);
      const ok = await recorder.start();
      if (!ok) {
        toast("Microphone unavailable", {
          description: "Check DROP's microphone permission in system settings.",
        });
        return;
      }
      setVoice("recording");
    } else if (voice === "recording") {
      recorderRef.current?.pause();
      setVoice("paused");
    } else {
      recorderRef.current?.resume();
      setVoice("recording");
    }
  };

  const stopVoice = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const rec = await recorder.stop();
    setVoice("idle");
    if (!rec) return;
    setBusy(true);
    try {
      const fileName = `voice-note-${new Date().toISOString().slice(0, 10)}.webm`;
      const result = await uploadFile(rec.blob, { kind: "document", fileName });
      finishOne(result);
      close();
      if (result?.dropId && result.duplicate !== true) navigate(`/app/drop/${result.dropId}`);
    } catch {
      toast("Couldn't upload the voice note", {
        description: "Your recording is safe — try again in a moment.",
      });
    } finally {
      setBusy(false);
      recorderRef.current = null;
    }
  };

  const cancelVoice = () => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setVoice("idle");
    setVoiceMs(0);
  };

  const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  // -------------------------------------------------------------------------
  // Incoming share → preview mode
  // -------------------------------------------------------------------------

  if (share) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t-0 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          <SheetHeader className="px-0 text-left">
            <SheetTitle className="flex items-center gap-2 text-lg tracking-tight">
              <UploadCloud className="h-5 w-5 text-primary" />
              Save to DROP
            </SheetTitle>
            <SheetDescription className="text-sm">
              This was shared with DROP. Save it to your memory?
            </SheetDescription>
          </SheetHeader>

          <div className="mt-2 space-y-3">
            {share.imageDataUrl && (
              <div className="overflow-hidden rounded-2xl border border-border/80">
                <img
                  src={share.imageDataUrl}
                  alt="Shared"
                  className="max-h-64 w-full object-contain bg-black/40"
                />
              </div>
            )}
            {share.url && (
              <div className="rounded-2xl border border-border/80 bg-muted/40 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Link</p>
                <a href={share.url} className="mt-0.5 block truncate text-sm font-semibold text-primary">
                  {share.url}
                </a>
              </div>
            )}
            {share.text && (
              <div className="rounded-2xl border border-border/80 bg-muted/40 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Text</p>
                <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-sm">{share.text}</p>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={close} disabled={busy}>
              Not now
            </Button>
            <Button
              className="flex-[2] gap-2 rounded-xl font-semibold"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  haptic("light");
                  if (share.url && !share.imageDataUrl) {
                    const result = await create({ kind: "link", url: share.url });
                    finishOne(result);
                    close();
                    if (result?.dropId && result.duplicate !== true) navigate(`/app/drop/${result.dropId}`);
                    return;
                  }
                  if (share.imageDataUrl) {
                    const result = await uploadFile(dataUrlToBlob(share.imageDataUrl), {
                      kind: "screenshot",
                      fileName: share.fileName ?? `shared-${Date.now()}.jpg`,
                    });
                    finishOne(result);
                    close();
                    if (result?.dropId && result.duplicate !== true) navigate(`/app/drop/${result.dropId}`);
                    return;
                  }
                  if (share.text) {
                    const result = await create({ kind: "note", text: share.text });
                    finishOne(result);
                    close();
                    if (result?.dropId && result.duplicate !== true) navigate(`/app/drop/${result.dropId}`);
                    return;
                  }
                } catch {
                  toast("Couldn't save that");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Save to DROP
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // -------------------------------------------------------------------------
  // Capture menu
  // -------------------------------------------------------------------------

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t-0 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <SheetHeader className="px-0 text-left">
          <SheetTitle className="text-lg tracking-tight">Drop Something</SheetTitle>
          <SheetDescription className="text-sm">
            Capture anything. DROP figures out the rest.
          </SheetDescription>
        </SheetHeader>

        {progress && (
          <div className="mt-2 rounded-2xl border border-primary/25 bg-accent/50 px-4 py-3">
            <p className="text-sm font-semibold">
              Dropping {progress.done} of {progress.total}…
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              You can leave this screen — drops keep processing in the background.
            </p>
          </div>
        )}

        {voice !== "idle" ? (
          <div className="mt-3 rounded-3xl border border-rose-500/25 bg-rose-500/5 p-5 text-center">
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
              {voice === "recording" && (
                <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/20" />
              )}
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-300">
                <Mic className="h-6 w-6" />
              </span>
            </div>
            <p className="mt-3 font-bold tracking-tight">
              {voice === "recording" ? "Recording…" : "Paused"}
            </p>
            <p className="mt-1 font-mono text-2xl font-extrabold tabular-nums">{formatMs(voiceMs)}</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button variant="ghost" size="icon" className="rounded-full" onClick={cancelVoice} aria-label="Cancel">
                <Square className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                className="h-14 w-14 rounded-full"
                onClick={() => void toggleVoice()}
                aria-label={voice === "recording" ? "Pause" : "Resume"}
              >
                {voice === "recording" ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
              </Button>
              <Button variant="outline" size="icon" className="rounded-full" onClick={() => void stopVoice()} aria-label="Stop and save">
                <UploadCloud className="h-4 w-4 text-primary" />
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Stop to save · audio stays in your private library
            </p>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <ActionButton icon={Camera} label="Take Photo" hint="Use the camera" onClick={() => void onTakePhoto()} disabled={busy} />
            <ActionButton icon={ImagePlus} label="Choose Photo" hint="From your library" onClick={() => void onPickPhotos(false)} disabled={busy} />
            <ActionButton icon={StickyNote} label="Gallery (multi)" hint="Pick several screenshots" onClick={() => void onPickPhotos(true)} disabled={busy} />
            <ActionButton icon={Mic} label="Voice Note" hint="Hands-free memory" onClick={() => void toggleVoice()} disabled={busy} />
            <ActionButton icon={Link2} label="Paste Link" hint="URL, post, article" onClick={() => { haptic("light"); onOpenAdvanced("link"); close(); }} disabled={busy} />
            <ActionButton icon={StickyNote} label="Write Note" hint="A quick thought" onClick={() => { haptic("light"); onOpenAdvanced("note"); close(); }} disabled={busy} />
            <ActionButton icon={FileUp} label="Document" hint="PDF, DOCX, text" onClick={() => void onDocument()} disabled={busy} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ActionButton({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled,
}: {
  icon: typeof Camera;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border/80 bg-card p-3.5 text-left transition-all hover:border-primary/40 hover:bg-accent/40 active:scale-[0.98] disabled:opacity-50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-tight">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
