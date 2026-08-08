/**
 * Supabase auth error → human-readable message.
 *
 * The raw Supabase messages ("Invalid login credentials", "User already
 * registered") are fine for developers but not for consumers. Every known
 * code/message is translated here; unknown errors fall back to a generic
 * message so users never see "Failed to fetch", stack traces or raw JSON.
 */

const KNOWN: Array<{ match: RegExp; message: string }> = [
  { match: /invalid login credentials/i, message: "Wrong email or password." },
  { match: /email not confirmed/i, message: "Please confirm your email first — check your inbox." },
  { match: /user already registered/i, message: "An account with this email already exists. Sign in instead." },
  { match: /user already exists/i, message: "An account with this email already exists. Sign in instead." },
  { match: /password should be at least/i, message: "Password must be at least 6 characters." },
  { match: /password.*too short/i, message: "Password must be at least 6 characters." },
  { match: /rate limit/i, message: "Too many attempts — wait a moment and try again." },
  { match: /over.*request rate limit/i, message: "Too many attempts — wait a moment and try again." },
  { match: /email.*invalid/i, message: "That email address doesn't look right." },
  { match: /unable to validate email/i, message: "That email address doesn't look right." },
  { match: /recovery email/i, message: "We couldn't send a reset link to that address." },
  { match: /new password should be different/i, message: "New password must be different from the old one." },
  { match: /weak password/i, message: "That password is too weak — try a longer one." },
  { match: /invalid refresh token/i, message: "Your session expired — sign in again." },
  { match: /session expired/i, message: "Your session expired — sign in again." },
  { match: /network/i, message: "Couldn't reach the network — check your connection and try again." },
  { match: /fetch/i, message: "Couldn't reach DROP's servers — check your connection and try again." },
  { match: /Failed to fetch/i, message: "Couldn't reach DROP's servers — check your connection and try again." },
  { match: /for security purposes/i, message: "Too many failed attempts — try again in a minute." },
  { match: /user not found/i, message: "No account found with that email." },
  { match: /signup not confirmed/i, message: "Please confirm your email first — check your inbox." },
  { match: /timed out|timedout|abort/i, message: "Connection timed out. Try again." },
  { match: /offline|no internet|network request failed|load failed|networkerror/i, message: "You're offline — connect to the internet and try again." },
  { match: /popup closed|popup|oauth|authorization|provider.*denied|access denied/i, message: "Google sign-in didn't complete. Please try again." },
  { match: /already a registered user|already confirmed|reauthentication/i, message: "This action needs you to sign in again." },
];

export function authErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;
  const raw = error instanceof Error ? error.message : String(error);
  for (const { match, message } of KNOWN) {
    if (match.test(raw)) return message;
  }
  return fallback;
}

/**
 * Detect whether the backend is configured. The client degrades gracefully
 * (placeholder URL) until the user adds the real keys — surfaces as a clear
 * "connect your backend" state in the UI instead of a raw fetch error.
 */
export function backendConfiguredHint(): boolean {
  return (
    typeof import.meta.env.VITE_SUPABASE_URL === "string" &&
    import.meta.env.VITE_SUPABASE_URL.length > 0 &&
    !String(import.meta.env.VITE_SUPABASE_URL).includes("placeholder")
  );
}
