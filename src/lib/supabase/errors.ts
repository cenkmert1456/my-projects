/**
 * DROP network error utilities.
 *
 * Consumers never see raw "Failed to fetch" / TypeError messages. Every
 * network operation goes through `withTimeout` (so nothing spins forever) and
 * the resulting errors are translated to human messages by
 * `authErrorMessage` in ./auth-errors.
 */

export class DropTimeoutError extends Error {
  name = "DropTimeoutError";
  constructor(operation = "request") {
    super(`Request timed out: ${operation}`);
  }
}

/**
 * Race a promise against a timeout. Auth and data calls use this so a dead
 * network can never leave the UI spinning forever — the user gets a clear
 * "timed out — try again" state instead.
 */
export function withTimeout<T>(promise: Promise<T>, ms = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DropTimeoutError()), ms);
  });
  try {
    return Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** True for the classic browser "offline" fetch failures. */
export function isOfflineError(error: unknown): boolean {
  if (!error) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const raw = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|load failed|network request failed|offline|no internet/i.test(raw);
}

/** True when the browser/WebView believes it is offline right now. */
export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}
