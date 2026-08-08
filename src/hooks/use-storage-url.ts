import { useEffect, useState } from "react";
import { storageService } from "@/lib/services/storage";

/**
 * Resolve a private `drop-files` path to a short-lived signed URL.
 * Returns null while loading or when there is no file.
 */
export function useStorageUrl(path?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    setUrl(null);
    void storageService
      .getSignedUrl(path)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return url;
}
