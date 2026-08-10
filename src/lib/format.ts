// Small formatting helpers shared across DROP screens.
//
// All date/relative-time output is locale-aware: `setUiLanguage` is called
// by the i18n bootstrap whenever the app language changes, and Intl picks it
// up for dates, relative time and day headings.

let uiLang = "en";

/** Called by the i18n bootstrap — keeps formatting in sync with the UI. */
export function setUiLanguage(lang: string): void {
  uiLang = lang;
}

export function uiLanguage(): string {
  return uiLang;
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const rtf = new Intl.RelativeTimeFormat(uiLang, { numeric: "auto" });
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return rtf.format(0, "minute");
  if (mins < 60) return rtf.format(-mins, "minute");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days === 1) return rtf.format(-1, "day");
  if (days < 7) return rtf.format(-days, "day");
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return rtf.format(-weeks, "week");
  const months = Math.floor(days / 30);
  if (months < 12) return rtf.format(-months, "month");
  return rtf.format(-Math.floor(months / 12), "year");
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(uiLang, {
    month: "short",
    day: "numeric",
    year: new Date(ts).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(uiLang, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDayHeading(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(uiLang, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  JPY: "¥",
  TRY: "₺",
  CHF: "Fr",
};

export function formatPrice(price?: number, currency?: string): string {
  if (price === undefined || price === null) return "";
  const symbol = CURRENCY_SYMBOL[currency ?? ""] ?? `${currency ?? ""} `;
  const value = Number.isInteger(price)
    ? price.toLocaleString(uiLang)
    : price.toFixed(2);
  return `${symbol}${value}`.trim();
}

export function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

/** Time-of-day greeting key ("morning" | "afternoon" | "evening" | "night"). */
export function greetingKey(): "morning" | "afternoon" | "evening" | "night" {
  const h = new Date().getHours();
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

/** English greeting — kept for any callers not yet migrated to i18n. */
export function greeting(): string {
  const key = greetingKey();
  if (key === "morning") return "Good morning";
  if (key === "afternoon") return "Good afternoon";
  if (key === "evening") return "Good evening";
  return "Up late";
}

export function hostOf(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Extract a readable title from a URL for link drops. */
export function urlLabel(url?: string): string {
  if (!url) return "Saved link";
  const host = hostOf(url);
  const path = (() => {
    try {
      return new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    } catch {
      return "";
    }
  })();
  return path ? `${path} — ${host}` : host || "Saved link";
}
