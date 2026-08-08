// Client-side image optimization before upload.
//
// Screenshots from modern phones can be 12MP+ (5–15 MB). DROP's AI/OCR does
// not need that resolution, so we downscale to a sensible max dimension and
// re-encode as JPEG/WebP before upload. The original is discarded after the
// optimized version is saved (the Drop stores the optimized image).
//
// `maxDimension` is configurable (Settings → mobile data) so users on large
// plans can keep higher resolution when they want.

export const DEFAULT_MAX_DIMENSION = 1920;
export const DEFAULT_QUALITY = 0.85;

export interface OptimizedImage {
  blob: Blob;
  /** e.g. "image/jpeg" */
  mimeType: string;
  width: number;
  height: number;
  /** "original" when no compression was needed. */
  mode: "compressed" | "original";
}

/**
 * Downscale + re-encode an image File/Blob.
 * Returns the original untouched when it's already small (no quality loss).
 */
export async function optimizeImage(
  file: Blob,
  opts: { maxDimension?: number; quality?: number } = {},
): Promise<OptimizedImage> {
  const maxDimension = opts.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    if (scale >= 1) {
      bitmap.close();
      return {
        blob: file,
        mimeType: file.type || "image/jpeg",
        width,
        height,
        mode: "original",
      };
    }

    const outWidth = Math.round(width * scale);
    const outHeight = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { blob: file, mimeType: file.type || "image/jpeg", width, height, mode: "original" };
    }
    ctx.drawImage(bitmap, 0, 0, outWidth, outHeight);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) {
      return { blob: file, mimeType: file.type || "image/jpeg", width, height, mode: "original" };
    }
    return { blob, mimeType: "image/jpeg", width: outWidth, height: outHeight, mode: "compressed" };
  } catch {
    // createImageBitmap unsupported (older WebViews) → upload as-is.
    return {
      blob: file,
      mimeType: file.type || "image/jpeg",
      width: 0,
      height: 0,
      mode: "original",
    };
  }
}

/** Convert a base64 data URL into a Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
  const bytes = atob(body);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
