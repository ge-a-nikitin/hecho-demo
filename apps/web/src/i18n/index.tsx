import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en, type Messages } from "./messages/en";
import { es } from "./messages/es";
import { ru } from "./messages/ru";

export type Language = "en" | "ru" | "es";
export type MessageParams = Record<string, string | number>;
export type PluralForms = { one: string; few?: string; many?: string; other: string };

export const LANGUAGE_STORAGE_KEY = "order-desk.language";
export const DEFAULT_LANGUAGE: Language = "en";
export const languages: Language[] = ["en", "ru", "es"];
export const languageNames: Record<Language, string> = {
  en: "English",
  ru: "Русский",
  es: "Español",
};
export const localesByLanguage: Record<Language, string> = {
  en: "en-US",
  ru: "ru-RU",
  es: "es-ES",
};
export const messagesByLanguage: Record<Language, Messages> = { en, ru, es };

const PLACEHOLDER = /\{(\w+)\}/gu;

export function formatTemplate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

function isLanguage(value: string | null | undefined): value is Language {
  return value !== null && value !== undefined && (languages as string[]).includes(value);
}

function readStoredLanguage(): Language | null {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function getInitialLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;

  const fromQuery = new URLSearchParams(window.location.search).get("lang");
  if (isLanguage(fromQuery)) return fromQuery;

  return readStoredLanguage() ?? DEFAULT_LANGUAGE;
}

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  locale: string;
  t: Messages;
  format: (template: string, params?: MessageParams) => string;
  plural: (count: number, forms: PluralForms) => string;
  formatDate: (value: string) => string;
  formatAmount: (value: number | string) => string;
  formatBytes: (bytes: number) => string;
  formatMinutes: (minutes: number) => string;
  errorMessage: (error: unknown, fallback: string) => string;
  statusLabel: (status: string) => string;
  estimateStatusLabel: (status: string) => string;
  invoiceStatusLabel: (status: string) => string;
  paymentReportStatusLabel: (status: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);
  const locale = localesByLanguage[language];
  const t = messagesByLanguage[language];

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode, blocked cookies); the session still works.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t.meta.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", t.meta.description);
  }, [language, t]);

  const format = useCallback(
    (template: string, params?: MessageParams) => formatTemplate(template, params),
    [],
  );

  const plural = useCallback(
    (count: number, forms: PluralForms) => {
      const rule = new Intl.PluralRules(locale).select(count) as keyof PluralForms;
      return formatTemplate(forms[rule] ?? forms.other, { count });
    },
    [locale],
  );

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }),
    [locale],
  );
  const amountFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    [locale],
  );
  const byteFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
    [locale],
  );

  const formatDate = useCallback(
    (value: string) => dateFormatter.format(new Date(value)),
    [dateFormatter],
  );
  const formatAmount = useCallback(
    (value: number | string) => amountFormatter.format(Number(value)),
    [amountFormatter],
  );
  const formatBytes = useCallback(
    (bytes: number) =>
      bytes < 1024
        ? `${bytes} ${t.common.bytes}`
        : `${byteFormatter.format(bytes / 1024)} ${t.common.kilobytes}`,
    [byteFormatter, t],
  );
  const formatMinutes = useCallback(
    (minutes: number) => {
      const hours = Math.floor(minutes / 60);
      const remainder = minutes % 60;
      return hours
        ? `${hours} ${t.common.hoursShort} ${remainder} ${t.common.minutesShort}`
        : `${remainder} ${t.common.minutesShort}`;
    },
    [t],
  );

  const errorMessage = useCallback(
    (error: unknown, fallback: string) => {
      const messages = t.errors as Record<string, string>;
      if (error instanceof TypeError) return messages.NETWORK_ERROR;

      if (typeof error === "object" && error !== null) {
        if ("code" in error && typeof error.code === "string" && error.code in messages) {
          return messages[error.code];
        }
        if ("status" in error && typeof error.status === "number") {
          return messages[statusToErrorCode(error.status)] ?? fallback;
        }
      }

      return fallback;
    },
    [t],
  );

  const statusLabel = useCallback(
    (status: string) => (t.statuses as Record<string, string>)[status] ?? status,
    [t],
  );
  const estimateStatusLabel = useCallback(
    (status: string) => (t.estimateStatuses as Record<string, string>)[status] ?? status,
    [t],
  );
  const invoiceStatusLabel = useCallback(
    (status: string) => (t.invoiceStatuses as Record<string, string>)[status] ?? status,
    [t],
  );
  const paymentReportStatusLabel = useCallback(
    (status: string) => (t.paymentReportStatuses as Record<string, string>)[status] ?? status,
    [t],
  );

  const value: I18nContextValue = {
    language,
    setLanguage,
    locale,
    t,
    format,
    plural,
    formatDate,
    formatAmount,
    formatBytes,
    formatMinutes,
    errorMessage,
    statusLabel,
    estimateStatusLabel,
    invoiceStatusLabel,
    paymentReportStatusLabel,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function statusToErrorCode(status: number): string {
  switch (status) {
    case 400: return "BAD_REQUEST";
    case 401: return "UNAUTHENTICATED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 405: return "METHOD_NOT_ALLOWED";
    case 409: return "CONFLICT";
    case 413: return "PAYLOAD_TOO_LARGE";
    case 415: return "UNSUPPORTED_MEDIA_TYPE";
    case 422: return "VALIDATION_FAILED";
    case 429: return "TOO_MANY_REQUESTS";
    case 503: return "SERVICE_UNAVAILABLE";
    default: return status >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED";
  }
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
