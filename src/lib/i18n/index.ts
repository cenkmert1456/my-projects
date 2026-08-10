/**
 * DROP i18n — one codebase, 18 languages, automatic device detection,
 * full RTL support for Arabic and locale-aware formatting.
 *
 * Language choice is persisted in two places:
 *   1. localStorage ("drop.language") — instant, offline-safe
 *   2. the user's profile row (`locale` column) — syncs across devices
 *
 * UI consumes it via `useTranslation()` from react-i18next. Formatting
 * helpers in `@/lib/format` pick up the active language automatically.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { setUiLanguage } from "@/lib/format";
import en from "./locales/en";
import tr from "./locales/tr";
import de from "./locales/de";
import fr from "./locales/fr";
import es from "./locales/es";
import it from "./locales/it";
import pt from "./locales/pt";
import nl from "./locales/nl";
import pl from "./locales/pl";
import ru from "./locales/ru";
import uk from "./locales/uk";
import ar from "./locales/ar";
import ja from "./locales/ja";
import ko from "./locales/ko";
import zhCN from "./locales/zh-CN";
import zhTW from "./locales/zh-TW";
import hi from "./locales/hi";
import id from "./locales/id";

export const SUPPORTED_LANGUAGES = [
  { code: "en", dir: "ltr" },
  { code: "tr", dir: "ltr" },
  { code: "de", dir: "ltr" },
  { code: "fr", dir: "ltr" },
  { code: "es", dir: "ltr" },
  { code: "it", dir: "ltr" },
  { code: "pt", dir: "ltr" },
  { code: "nl", dir: "ltr" },
  { code: "pl", dir: "ltr" },
  { code: "ru", dir: "ltr" },
  { code: "uk", dir: "ltr" },
  { code: "ar", dir: "rtl" },
  { code: "ja", dir: "ltr" },
  { code: "ko", dir: "ltr" },
  { code: "zh-CN", dir: "ltr" },
  { code: "zh-TW", dir: "ltr" },
  { code: "hi", dir: "ltr" },
  { code: "id", dir: "ltr" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const RTL_LANGUAGES = new Set<string>(
  SUPPORTED_LANGUAGES.filter((l) => l.dir === "rtl").map((l) => l.code),
);

const STORAGE_KEY = "drop.language";

export function isSupportedLanguage(code: string | undefined | null): code is LanguageCode {
  return Boolean(code && SUPPORTED_LANGUAGES.some((l) => l.code === code));
}

export function detectInitialLanguage(): LanguageCode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isSupportedLanguage(stored)) return stored;
  } catch {
    // storage unavailable — fall through to device detection
  }
  if (typeof navigator !== "undefined") {
    const nav = navigator.language ?? "";
    const base = nav.split("-")[0];
    if (isSupportedLanguage(nav)) return nav;
    if (isSupportedLanguage(base)) return base as LanguageCode;
  }
  return "en";
}

export function applyLanguageDirection(lang: string): void {
  if (typeof document === "undefined") return;
  const dir = RTL_LANGUAGES.has(lang) ? "rtl" : "ltr";
  document.documentElement.dir = dir;
  document.documentElement.lang = lang;
}

/** Switch the UI language immediately (no restart) and persist the choice. */
export function setAppLanguage(lang: LanguageCode): void {
  void i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
  applyLanguageDirection(lang);
  setUiLanguage(lang);
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    tr: { translation: tr },
    de: { translation: de },
    fr: { translation: fr },
    es: { translation: es },
    it: { translation: it },
    pt: { translation: pt },
    nl: { translation: nl },
    pl: { translation: pl },
    ru: { translation: ru },
    uk: { translation: uk },
    ar: { translation: ar },
    ja: { translation: ja },
    ko: { translation: ko },
    "zh-CN": { translation: zhCN },
    "zh-TW": { translation: zhTW },
    hi: { translation: hi },
    id: { translation: id },
  },
  lng: detectInitialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
});

applyLanguageDirection(i18n.language);
setUiLanguage(i18n.language);

export default i18n;
