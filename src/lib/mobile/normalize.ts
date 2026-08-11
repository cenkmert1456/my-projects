/**
 * normalizeNativeFile — one input shape for every capture source.
 *
 * Android selection can arrive as a content:// URI, a webPath, a base64
 * data URL, a Blob, or a File — and desktop browser code must never assume a
 * native URI is a browser File. This utility converts any of those into a
 * single normalized structure the upload pipeline understands.
 */

export interface NativeFileSource {
  /** base64 data URL (Camera plugin resultType DataUrl, capawesome readData). */
  dataUrl?: string;
  /** native path — content:// or file:// (FilePicker `path`, Camera `webPath`). */
  path?: string;
  /** browser File / Blob. */
  blob?: Blob;
  /** raw bytes (e.g. a fetched ArrayBuffer). */
  arrayBuffer?: ArrayBuffer;
  name?: string;
  mimeType?: string;
  size?: number;
}

export interface NormalizedFile {
  name: string;
  mimeType: string;
  size: number;
  /** Where the file lives locally (path/webPath) — for retries/preview. */
  localUri?: string;
  /** Bytes ready to upload to Supabase Storage. */
  uploadBody: Blob;
  /** Object URL or data URL usable in <img> / previews. */
  previewUrl: string;
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [head, body] = dataUrl.split(",");
    const mime = head.match(/data:(.*?)(;|$)/)?.[1] ?? "application/octet-stream";
    const bytes = atob(body);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  } catch {
    return null;
  }
}

/** Blob → preview URL. Keeps an object URL alive; caller revokes if desired. */
function blobToPreviewUrl(blob: Blob): string {
  try {
    return URL.createObjectURL(blob);
  } catch {
    return "";
  }
}

/**
 * Convert any captured source into a normalized file. Returns null only when
 * the source cannot be read at all. Throws nothing — callers get a friendly
 * "couldn't read that file" error instead.
 */
export async function normalizeNativeFile(input: NativeFileSource): Promise<NormalizedFile | null> {
  // 1. base64 data URL — no URI handling needed at all.
  if (input.dataUrl) {
    const blob = dataUrlToBlob(input.dataUrl);
    if (blob) {
      return {
        name: input.name || `capture-${Date.now()}.bin`,
        mimeType: blob.type || input.mimeType || "application/octet-stream",
        size: input.size ?? blob.size,
        uploadBody: blob,
        previewUrl: input.dataUrl,
      };
    }
  }

  // 2. Browser File / Blob.
  if (input.blob) {
    return {
      name: input.name || (input.blob instanceof File ? input.blob.name : `capture-${Date.now()}.bin`),
      mimeType: input.blob.type || input.mimeType || "application/octet-stream",
      size: input.blob.size,
      uploadBody: input.blob,
      previewUrl: blobToPreviewUrl(input.blob),
    };
  }

  // 3. Raw bytes.
  if (input.arrayBuffer) {
    const blob = new Blob([input.arrayBuffer], { type: input.mimeType ?? "application/octet-stream" });
    return {
      name: input.name || `capture-${Date.now()}.bin`,
      mimeType: blob.type,
      size: blob.size,
      uploadBody: blob,
      previewUrl: blobToPreviewUrl(blob),
    };
  }

  // 4. Native path / webPath — fetch it (works for Camera webPath on both
  //    platforms and for capawesome's fetch(path) contract). If fetch fails,
  //    fall back to Filesystem.readFile for content:// URIs.
  if (input.path) {
    try {
      const res = await fetch(input.path);
      if (res.ok) {
        const blob = await res.blob();
        return {
          name: input.name || input.path.split("/").pop() || "capture.bin",
          mimeType: blob.type || input.mimeType || "application/octet-stream",
          size: input.size ?? blob.size,
          localUri: input.path,
          uploadBody: blob,
          previewUrl: blobToPreviewUrl(blob),
        };
      }
    } catch {
      // fall through to Filesystem
    }
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const res = await Filesystem.readFile({ path: input.path, directory: Directory.Data });
      if (res.data && typeof res.data === "string" && res.data.startsWith("data:")) {
        const blob = dataUrlToBlob(res.data);
        if (blob) {
          return {
            name: input.name || "capture.bin",
            mimeType: blob.type || input.mimeType || "application/octet-stream",
            size: blob.size,
            localUri: input.path,
            uploadBody: blob,
            previewUrl: res.data,
          };
        }
      }
    } catch {
      // unreachable source — caller decides the message
    }
  }

  return null;
}
