import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { dropService, storageService } from "@/lib/services";
import {
  Camera,
  ChevronLeft,
  FileUp,
  ImagePlus,
  Images,
  Link2,
  Loader2,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Settings,
  Square,
  StickyNote,
  UploadCloud,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  haptic,
  pickPhotos,
  takePhoto,
  pickedFileToBlob,
  pickDocument,
  openAppSettings,
  requestPermission,
  DropPermissionError,
  type CapturedPhoto,
} from "@/lib/mobile/native";
import { optimizeImage, dataUrlToBlob } from "@/lib/mobile/image";
import { VoiceRecorder } from "@/lib/mobile/voice";
import { authErrorMessage } from "@/lib/supabase/auth-errors";
import { useTranslation } from "react-i18next";
import type { SharePayload } from "@/components/app/AddDropContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled from an incoming share (image/text/URL). */
  share?: SharePayload | null;
  /** Desktop advanced-sheet fallback (kept for API compatibility). */
  _onOpenAdvanced?: (kind: "link" | "note" | "document") => void;
}

type View = "menu" | "link" | "note" | "preview";

interface PendingPhoto {
  photo: CapturedPhoto;
  fileName: string;
  kind: "screenshot" | "image";
}

export function MobileCaptureSheet({ open, onOpenChange, share }: Props) {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();

  const [view, setView] = useState<View>("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<DropPermissionError | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [voice, setVoice] = useState<"idle" | "recording" | "paused">("idle");
  const [voiceMs, setVoiceMs] = useState(0);
  const recorderRef = useRef<VoiceRecorder | null>(null);

  useEffect(() => {
    if (open) {
      setView("menu");
      setBusy(false);
      setError(null);
      setPermissionError(null);
      setProgress(null);
      setPending([]);
      setLinkUrl("");
      setNoteTitle("");
      setNoteBody("");
      setVoice("idle");
      setVoiceMs(0);
    }
  }, [open]);

  const close = () => onOpenChange(false);

  const notify = (message: string) => {
    toast(message, { description: t("capture.savedDesc") });
  };

  // -------------------------------------------------------------------------
  // Upload pipeline (shared by every capture path — one normalized flow)
  // -------------------------------------------------------------------------

  const uploadFile = async (
    file: Blob,
    opts: { kind: "screenshot" | "image" | "document"; fileName?: string },
  ) => {
    if (!isAuthenticated || !userId) return null;
    let body: Blob = file;
    let contentType = file.type || "application/octet-stream";
    if (file.type.startsWith("image/")) {
      try {
        const optimized = await optimizeImage(file);
        body = optimized.blob;
        contentType = optimized.mimeType;
      } catch {
        // keep original
      }
    }
    const path = await storageService.uploadFile({
      userId,
      dropId: "pending",
      file: body,
      fileName: opts.fileName ?? "capture.bin",
      contentType,
    });
    return dropService.create(userId, {
      kind: opts.kind,
      storagePath: path,
      contentType,
      fileName: opts.fileName,
    });
  };

  const finishOne = (result: { duplicate?: boolean; dropId?: string } | null) => {
    haptic("success");
    if (result?.duplicate && result.dropId) {
      toast(t("capture.alreadySaved"), { description: t("capture.alreadySavedDesc") });
      return;
    }
    toast(t("capture.saved"), { description: t("capture.savedDesc") });
  };

  const goToDrop = (result: { duplicate?: boolean; dropId?: string } | null) => {
    close();
    if (result?.dropId && result.duplicate !== true) navigate(`/app/drop/${result.dropId}`);
  };

  // -------------------------------------------------------------------------
  // Capture actions
  // -------------------------------------------------------------------------

  const onTakePhoto = async () => {
    haptic("light");
    setBusy(true);
    setError(null);
    setPermissionError(null);
    try {
      const photo = await takePhoto();
      if (!photo || !photo.dataUrl) return; // cancelled — sheet stays open
      setPending([
        { photo, fileName: photo.displayName ?? "photo.jpg", kind: "screenshot" },
      ]);
      setView("preview");
    } catch (err) {
      if (err instanceof DropPermissionError) {
        setPermissionError(err);
        setError(
          err.permanent
            ? t("permissions.cameraDisabled")
            : t("permissions.cameraNeeded"),
        );
      } else {
        setError(t("capture.cameraFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const onPickPhotos = async (multiple: boolean) => {
    haptic("light");
    setBusy(true);
    try {
      const photos = await pickPhotos(multiple);
      if (photos.length === 0) return; // cancelled — sheet stays open
      setPending(
        photos.map((p) => ({
          photo: p,
          fileName: p.displayName ?? `photo-${Date.now()}.jpg`,
          kind: "image",
        })),
      );
      setView("preview");
    } catch {
      setError(t("capture.galleryFailed"));
    } finally {
      setBusy(false);
    }
  };

  const onSavePreview = async () => {
    if (!pending.length) return;
    haptic("light");
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: pending.length });
    const ids: string[] = [];
    try {
      for (let i = 0; i < pending.length; i++) {
        const p = pending[i];
        const blob = await pickedFileToBlob(p.photo);
        if (blob) {
          const result = await uploadFile(blob, { kind: p.kind, fileName: p.fileName });
          if (result?.dropId && result.duplicate !== true) ids.push(String(result.dropId));
        }
        setProgress({ done: i + 1, total: pending.length });
      }
      haptic("success");
      toast(
        pending.length > 1 ? `${t("capture.saved")} ×${pending.length}` : t("capture.saved"),
        { description: t("capture.savedDesc") },
      );
      close();
      if (ids.length) navigate(`/app/drop/${ids[0]}`);
    } catch (err) {
      setError(authErrorMessage(err, t("capture.galleryFailed")));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const onDocument = async () => {
    haptic("light");
    setBusy(true);
    setError(null);
    try {
      const doc = await pickDocument();
      if (!doc) return; // cancelled
      if (doc.dataUrl) {
        const result = await uploadFile(dataUrlToBlob(doc.dataUrl), {
          kind: "document",
          fileName: doc.name ?? "document.bin",
        });
        finishOne(result);
        goToDrop(result);
      } else if (doc.path) {
        const res = await fetch(doc.path);
        const blob = await res.blob();
        const result = await uploadFile(blob, { kind: "document", fileName: doc.name });
        finishOne(result);
        goToDrop(result);
      }
    } catch {
      setError(t("capture.documentFailed"));
    } finally {
      setBusy(false);
    }
  };

  const saveLink = async () => {
    if (!linkUrl.trim() || !userId) return;
    setBusy(true);
    setError(null);
    try {
      let url = linkUrl.trim();
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      const result = await dropService.create(userId, { kind: "link", url });
      finishOne(result);
      goToDrop(result);
    } catch (err) {
      setError(authErrorMessage(err, "Couldn't save that link."));
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!noteBody.trim() || !userId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await dropService.create(userId, {
        kind: "note",
        text: noteBody.trim(),
        title: noteTitle.trim() || undefined,
      });
      finishOne(result);
      goToDrop(result);
    } catch (err) {
      setError(authErrorMessage(err, "Couldn't save that note."));
      setBusy(false);
    }
  };

  // -------------------------------------------------------------------------
  // Voice notes
  // -------------------------------------------------------------------------

  const toggleVoice = async () => {
    if (voice === "idle") {
      haptic("light");
      setError(null);
      setPermissionError(null);
      // Microphone is a real runtime permission — ask contextually, before
      // recording, and surface permanent denial with an Open Settings path.
      const mic = await requestPermission("microphone");
      if (mic.status !== "granted") {
        setPermissionError(new DropPermissionError("microphone", mic.permanent));
        setError(mic.permanent ? t("permissions.micDisabled") : t("permissions.micNeeded"));
        return;
      }
      const recorder = new VoiceRecorder();
      recorderRef.current = recorder;
      recorder.onTick = (ms) => setVoiceMs(ms);
      const ok = await recorder.start();
      if (!ok) {
        setError(t("capture.voiceFailed"));
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
    setVoiceMs(0);
    if (!rec) return;
    setBusy(true);
    try {
      const fileName = `voice-note-${new Date().toISOString().slice(0, 10)}.webm`;
      const result = await uploadFile(rec.blob, { kind: "document", fileName });
      finishOne(result);
      goToDrop(result);
    } catch {
      setError(t("capture.documentFailed"));
      setBusy(false);
    } finally {
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
          <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-border" />
          <SheetHeader className="px-0 text-left">
            <SheetTitle className="flex items-center gap-2 text-lg tracking-tight">
              <UploadCloud className="h-5 w-5 text-primary" />
              {t("capture.saveToDrop")}
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
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t("capture.link")}
                </p>
                <p className="mt-0.5 block truncate text-sm font-semibold text-primary">
                  {share.url}
                </p>
              </div>
            )}
            {share.text && (
              <div className="rounded-2xl border border-border/80 bg-muted/40 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t("capture.note")}
                </p>
                <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-sm">{share.text}</p>
              </div>
            )}
          </div>

          {error && <InlineError message={error} />}

          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={close} disabled={busy}>
              {t("capture.notNow")}
            </Button>
            <Button
              className="flex-[2] gap-2 rounded-xl font-semibold"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  haptic("light");
                  if (share.url && !share.imageDataUrl) {
                    const result = await dropService.create(userId ?? "", { kind: "link", url: share.url });
                    finishOne(result);
                    goToDrop(result);
                    return;
                  }
                  if (share.imageDataUrl) {
                    const result = await uploadFile(dataUrlToBlob(share.imageDataUrl), {
                      kind: "screenshot",
                      fileName: share.fileName ?? `shared-${Date.now()}.jpg`,
                    });
                    finishOne(result);
                    goToDrop(result);
                    return;
                  }
                  if (share.text) {
                    const result = await dropService.create(userId ?? "", { kind: "note", text: share.text });
                    finishOne(result);
                    goToDrop(result);
                    return;
                  }
                } catch (err) {
                  setError(authErrorMessage(err, "Couldn't save that."));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {t("capture.saveToDrop")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // -------------------------------------------------------------------------
  // Main sheet
  // -------------------------------------------------------------------------

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t-0 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-border" />

        <SheetHeader className="px-0 text-left">
          <div className="flex items-center gap-2">
            {view !== "menu" && (
              <button
                type="button"
                onClick={() => setView("menu")}
                className="-ml-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                aria-label={t("common.back")}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <div>
              <SheetTitle className="text-lg tracking-tight">
                {view === "link" ? t("capture.linkTitle") : view === "note" ? t("capture.noteTitle") : view === "preview" ? t("capture.saveToDrop") : t("capture.title")}
              </SheetTitle>
              <SheetDescription className="text-sm">
                {view === "menu" ? t("capture.subtitle") : view === "link" ? t("capture.linkSubtitle") : view === "note" ? t("capture.noteHint") : t("capture.savedDesc")}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Link editor */}
        {view === "link" && (
          <div className="mt-4 space-y-3">
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder={t("capture.linkPlaceholder")}
                inputMode="url"
                autoCapitalize="none"
                className="h-13 rounded-2xl py-3.5 pl-11 pr-4 text-[15px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveLink();
                }}
              />
            </div>
            {error && <InlineError message={error} />}
            <Button
              className="h-[52px] w-full gap-2 rounded-2xl font-semibold"
              disabled={!linkUrl.trim() || busy}
              onClick={() => void saveLink()}
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />}
              {t("capture.saveLink")}
            </Button>
          </div>
        )}

        {/* Note editor */}
        {view === "note" && (
          <div className="mt-4 space-y-3">
            <Input
              autoFocus
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder={t("capture.noteTitlePlaceholder")}
              className="h-13 rounded-2xl py-3.5 px-4 text-[15px]"
            />
            <Textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder={t("capture.noteBodyPlaceholder")}
              rows={5}
              className="rounded-2xl p-4 text-[15px] leading-relaxed"
            />
            {error && <InlineError message={error} />}
            <Button
              className="h-[52px] w-full gap-2 rounded-2xl font-semibold"
              disabled={!noteBody.trim() || busy}
              onClick={() => void saveNote()}
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <StickyNote className="h-5 w-5" />}
              {t("capture.saveNote")}
            </Button>
          </div>
        )}

        {/* Photo preview — review before saving */}
        {view === "preview" && (
          <div className="mt-4 space-y-3">
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-black/40">
              <img
                src={pending[0]?.photo.dataUrl ?? ""}
                alt="Preview"
                className="max-h-72 w-full object-contain"
              />
            </div>
            <p className="truncate px-1 text-xs text-muted-foreground">
              {pending.length > 1 ? `${pending.length} ${t("capture.photos")}` : pending[0]?.fileName}
            </p>
            {progress && (
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            )}
            {error && <InlineError message={error} />}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-[52px] flex-1 rounded-2xl"
                disabled={busy}
                onClick={() => {
                  setPending([]);
                  setView("menu");
                }}
              >
                {t("capture.notNow")}
              </Button>
              <Button
                className="h-[52px] flex-[2] gap-2 rounded-2xl font-semibold"
                disabled={busy}
                onClick={() => void onSavePreview()}
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
                {t("capture.saveToDrop")}
              </Button>
            </div>
          </div>
        )}

        {/* Capture menu / voice panel */}
        {view === "menu" &&
          (voice !== "idle" ? (
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
                {voice === "recording" ? t("capture.voice") : t("capture.note")}
              </p>
              <p className="mt-1 font-mono text-2xl font-extrabold tabular-nums">{formatMs(voiceMs)}</p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button variant="ghost" size="icon" className="rounded-full" onClick={cancelVoice} aria-label={t("common.cancel")}>
                  <Square className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  className="h-14 w-14 rounded-full"
                  onClick={() => void toggleVoice()}
                  aria-label={voice === "recording" ? t("common.back") : t("common.next")}
                >
                  {voice === "recording" ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                </Button>
                <Button variant="outline" size="icon" className="rounded-full" onClick={() => void stopVoice()} aria-label={t("capture.saveToDrop")}>
                  <UploadCloud className="h-4 w-4 text-primary" />
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {t("capture.voiceHint")} · {t("capture.subtitle")}
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {error &&
                (permissionError ? (
                  <PermissionErrorBlock
                    err={permissionError}
                    message={error}
                    onRetry={permissionError.kind === "microphone" ? () => void toggleVoice() : () => void onTakePhoto()}
                  />
                ) : (
                  <InlineError message={error} />
                ))}
              <CaptureRow icon={Camera} label={t("capture.takePhoto")} hint={t("capture.takePhotoHint")} onClick={() => void onTakePhoto()} />
              <CaptureRow icon={ImagePlus} label={t("capture.photos")} hint={t("capture.photosHint")} onClick={() => void onPickPhotos(false)} />
              <CaptureRow icon={Images} label={t("capture.screenshot")} hint={t("capture.screenshotHint")} onClick={() => void onPickPhotos(false)} />
              <CaptureRow icon={Link2} label={t("capture.link")} hint={t("capture.linkHint")} onClick={() => { haptic("light"); setView("link"); }} />
              <CaptureRow icon={StickyNote} label={t("capture.note")} hint={t("capture.noteHint")} onClick={() => { haptic("light"); setView("note"); }} />
              <CaptureRow icon={FileUp} label={t("capture.document")} hint={t("capture.documentHint")} onClick={() => void onDocument()} />
              <CaptureRow icon={Mic} label={t("capture.voice")} hint={t("capture.voiceHint")} onClick={() => void toggleVoice()} />
            </div>
          ))}
      </SheetContent>
    </Sheet>
  );
}

function CaptureRow({
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
      className="flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border border-border/70 bg-card px-4 py-3 text-left transition-all hover:border-primary/35 hover:bg-accent/40 active:scale-[0.99] disabled:opacity-50"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-tight">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p className="rounded-2xl bg-red-500/10 px-4 py-2.5 text-[13px] font-medium leading-snug text-red-600 dark:text-red-300">
      {message}
    </p>
  );
}

/** Permission denial — real recovery actions instead of a dead-end toast. */
function PermissionErrorBlock({
  err,
  message,
  onRetry,
}: {
  err: DropPermissionError;
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <p className="rounded-2xl bg-amber-500/10 px-4 py-2.5 text-[13px] font-medium leading-snug text-amber-700 dark:text-amber-300">
        {message}
      </p>
      <div className="flex gap-2">
        {err.permanent ? (
          <Button
            variant="outline"
            className="h-10 flex-1 gap-1.5 rounded-xl text-[13px] font-semibold"
            onClick={() => void openAppSettings()}
          >
            <Settings className="h-4 w-4" />
            {t("permissions.openSettings")}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="h-10 flex-1 gap-1.5 rounded-xl text-[13px] font-semibold"
            onClick={onRetry}
          >
            <RefreshCw className="h-4 w-4" />
            {t("permissions.tryAgain")}
          </Button>
        )}
      </div>
    </div>
  );
}
