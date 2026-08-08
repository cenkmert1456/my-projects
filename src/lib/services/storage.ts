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
};
