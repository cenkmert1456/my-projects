/**
 * storageService — Supabase Storage for private user files.
 *
 * All files live in the private `drop-files` bucket under
 * `<user_id>/<drop_id>/<filename>` (ownership enforced by RLS on the first
 * path segment). Private files are only ever served through short-lived
 * signed URLs — the bucket is never public.
 */

import { supabase } from "@/lib/supabase/client";

const BUCKET = "drop-files";

export const storageService = {
  bucket: BUCKET,

  /** Upload a file for a drop; returns the storage path. */
  async uploadFile(params: {
    userId: string;
    dropId: string;
    file: Blob | ArrayBuffer | string;
    fileName: string;
    contentType?: string;
    isThumbnail?: boolean;
  }): Promise<string> {
    const { userId, dropId, file, fileName, contentType, isThumbnail } = params;
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const prefix = isThumbnail ? "thumb_" : "";
    const path = `${userId}/${dropId}/${prefix}${safeName}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: contentType ?? "application/octet-stream", upsert: false });
    if (error) throw new Error(error.message);
    return path;
  },

  /** Re-upload with upsert (retry after a failed/interrupted upload). */
  async retryUpload(params: {
    path: string;
    file: Blob | ArrayBuffer | string;
    contentType?: string;
  }): Promise<string> {
    const { path, file, contentType } = params;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: contentType ?? "application/octet-stream", upsert: true });
    if (error) throw new Error(error.message);
    return path;
  },

  /** Short-lived signed URL for a private object (or null when missing). */
  async getSignedUrl(path: string | null | undefined, expiresIn = 3600): Promise<string | null> {
    if (!path) return null;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
    if (error || !data) return null;
    return data.signedUrl;
  },

  /** Get a public URL fallback (only meaningful for non-private content). */
  async getPublicUrl(path: string | null | undefined): Promise<string | null> {
    if (!path) return null;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  },

  /** Delete one or more private objects (permanent drop delete). */
  async remove(paths: Array<string | null | undefined>): Promise<void> {
    const valid = paths.filter((p): p is string => Boolean(p));
    if (!valid.length) return;
    const { error } = await supabase.storage.from(BUCKET).remove(valid);
    if (error) {
      // Non-fatal: DB references are removed regardless; orphan cleanup can
      // be retried by the storage sweeper.
      console.warn("storage.remove failed", error.message);
    }
  },

  /** Download object bytes (used by export / share flows). */
  async download(path: string): Promise<Blob | null> {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return data;
  },

  /**
   * Real storage accounting for one user: walks their folder (cap 60 drop
   * folders) and sums object sizes from the Storage API. Returns null when
   * the bucket is missing/unreachable so the UI can degrade gracefully.
   */
  async usage(
    userId: string,
  ): Promise<{ bytes: number; files: number; largest: Array<{ name: string; bytes: number }> } | null> {
    try {
      const { data: folders, error: folderError } = await supabase.storage
        .from(BUCKET)
        .list(userId, { limit: 100, sortBy: { column: "name", order: "asc" } });
      if (folderError || !folders) return null;
      const all: Array<{ name: string; bytes: number }> = [];
      const dirs = folders.filter((f) => !f.id).slice(0, 60);
      if (!dirs.length) {
        // Files may sit directly under the user folder (flat uploads).
        for (const f of folders.filter((f) => f.id)) {
          const bytes = Number((f.metadata as { size?: number } | null)?.size ?? 0);
          if (bytes > 0) all.push({ name: f.name, bytes });
        }
      } else {
        for (const dir of dirs) {
          const { data: files, error: fileError } = await supabase.storage
            .from(BUCKET)
            .list(`${userId}/${dir.name}`, { limit: 100 });
          if (fileError || !files) continue;
          for (const f of files.filter((f) => f.id)) {
            const bytes = Number((f.metadata as { size?: number } | null)?.size ?? 0);
            if (bytes > 0) all.push({ name: `${dir.name}/${f.name}`, bytes });
          }
        }
      }
      const bytes = all.reduce((sum, f) => sum + f.bytes, 0);
      all.sort((a, b) => b.bytes - a.bytes);
      return { bytes, files: all.length, largest: all.slice(0, 5) };
    } catch {
      return null;
    }
  },
};
