// Offline upload queue.
//
// When the device has no connection, captures are written to local storage
// instead of being dropped. When connectivity returns, the queue is flushed
// through the normal DROP create pipeline. Draft text notes survive too.
//
// Storage: a JSON array in localStorage (web) / Preferences (native). Payloads
// are small — images are stored as data URLs only while waiting; large files
// are capped.

import type { Id } from "@/convex/_generated/dataModel";

export interface QueuedCapture {
  id: string;
  kind: "image" | "screenshot" | "document" | "link" | "note";
  /** data URL for images/documents (capped), plain text for notes */
  payload?: string;
  url?: string;
  text?: string;
  fileName?: string;
  contentType?: string;
  queuedAt: number;
}

const KEY = "drop.upload-queue.v1";
const MAX_QUEUE_ITEMS = 50;
const MAX_QUEUED_IMAGE_BYTES = 3 * 1024 * 1024; // keep queued images small

function read(): QueuedCapture[] {
  try {
    const raw = window.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedCapture[]) : [];
  } catch {
    return [];
  }
}

function write(queue: QueuedCapture[]) {
  try {
    window.localStorage?.setItem(KEY, JSON.stringify(queue.slice(-MAX_QUEUE_ITEMS)));
  } catch {
    // storage full — drop oldest
    try {
      window.localStorage?.setItem(KEY, JSON.stringify(queue.slice(-10)));
    } catch {
      // give up silently; nothing is corrupted, just lost
    }
  }
}

export function queueCapture(capture: QueuedCapture): void {
  const queue = read();
  queue.push(capture);
  write(queue);
}

export function listQueued(): QueuedCapture[] {
  return read();
}

export function removeQueued(id: string): void {
  write(read().filter((c) => c.id !== id));
}

export function clearQueued(): void {
  write([]);
}

export function queuedCount(): number {
  return read().length;
}

/** Enqueue a note/link so a typed draft is never lost offline. */
export function queueDraft(capture: Omit<QueuedCapture, "id" | "queuedAt">): string {
  const id = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  queueCapture({ ...capture, id, queuedAt: Date.now() });
  return id;
}

/** Enqueue an image/file; large payloads are truncated to stay within limits. */
export function queueFile(
  kind: "image" | "screenshot" | "document",
  dataUrl: string,
  fileName: string,
  contentType: string,
): string {
  const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const size = dataUrl.length * 0.75; // approx bytes
  const payload =
    size > MAX_QUEUED_IMAGE_BYTES
      ? dataUrl.slice(0, Math.floor(MAX_QUEUED_IMAGE_BYTES / 0.75))
      : dataUrl;
  queueCapture({
    id,
    kind,
    payload,
    fileName,
    contentType,
    queuedAt: Date.now(),
  });
  return id;
}

export type { Id };
