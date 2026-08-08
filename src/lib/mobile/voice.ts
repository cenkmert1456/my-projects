// Voice note recording.
//
// Uses the standard MediaRecorder API which works in the Capacitor WebView on
// both platforms (the native layer only supplies the microphone permission
// strings — already configured in Info.plist / AndroidManifest). If recording
// fails, the user still gets a clear message; the audio is only uploaded after
// the user explicitly saves.

export type VoiceRecorderState =
  | "idle"
  | "recording"
  | "paused"
  | "stopped";

export interface VoiceRecording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startedAt = 0;
  private elapsed = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  state: VoiceRecorderState = "idle";
  onTick: ((elapsedMs: number) => void) | null = null;

  async start(): Promise<boolean> {
    if (this.state === "recording") return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: mime });
      this.chunks = [];
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      this.mediaRecorder.start(250);
      this.state = "recording";
      this.startedAt = Date.now();
      this.elapsed = 0;
      this.timer = setInterval(() => {
        this.elapsed = Date.now() - this.startedAt;
        this.onTick?.(this.elapsed);
      }, 250);
      return true;
    } catch {
      return false;
    }
  }

  pause(): void {
    if (this.mediaRecorder && this.state === "recording") {
      this.mediaRecorder.pause();
      this.state = "paused";
      this.elapsed = Date.now() - this.startedAt;
      if (this.timer) clearInterval(this.timer);
    }
  }

  resume(): void {
    if (this.mediaRecorder && this.state === "paused") {
      this.mediaRecorder.resume();
      this.state = "recording";
      this.startedAt = Date.now() - this.elapsed;
      this.timer = setInterval(() => {
        this.elapsed = Date.now() - this.startedAt;
        this.onTick?.(this.elapsed);
      }, 250);
    }
  }

  stop(): Promise<VoiceRecording | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.state === "idle") return resolve(null);
      const finalize = () => {
        if (this.timer) clearInterval(this.timer);
        this.state = "stopped";
        this.stream?.getTracks().forEach((t) => t.stop());
        const mimeType = this.mediaRecorder?.mimeType ?? "audio/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        this.mediaRecorder = null;
        this.chunks = [];
        this.stream = null;
        resolve({ blob, mimeType, durationMs: this.elapsed || Date.now() - this.startedAt });
      };
      if (this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.onstop = finalize;
        this.mediaRecorder.stop();
      } else {
        finalize();
      }
    });
  }

  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.onstop = null;
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    if (this.timer) clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
    this.state = "idle";
  }
}
