import type { Locale } from "./messages";

const LOCALE_TAGS: Record<Locale, string> = {
  en: "en-KW",
  ar: "ar-KW",
};

export function localeTag(locale: Locale): string {
  return LOCALE_TAGS[locale] ?? LOCALE_TAGS.en;
}

type DateInput = Date | string | number | null | undefined;

function toDate(input: DateInput): Date | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(
  input: DateInput,
  locale: Locale = "en",
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
): string {
  const d = toDate(input);
  if (!d) return "";
  return new Intl.DateTimeFormat(localeTag(locale), options).format(d);
}

export function formatDateLong(input: DateInput, locale: Locale = "en"): string {
  return formatDate(input, locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export function formatTime(input: DateInput, locale: Locale = "en"): string {
  return formatDate(input, locale, { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(input: DateInput, locale: Locale = "en"): string {
  return formatDate(input, locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatNumber(
  value: number | null | undefined,
  locale: Locale = "en",
  options: Intl.NumberFormatOptions = {},
): string {
  if (value == null || Number.isNaN(value)) return "";
  return new Intl.NumberFormat(localeTag(locale), options).format(value);
}

export function formatCurrency(
  value: number | null | undefined,
  locale: Locale = "en",
  currency: string = "KWD",
): string {
  if (value == null || Number.isNaN(value)) return "";
  const symbol = locale === "ar" ? "د.ك" : "KD";
  const num = new Intl.NumberFormat(localeTag(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(value);
  return locale === "ar" ? `${num} ${symbol}` : `${symbol} ${num}`;
}

// Compact currency: KD 950, KD 1.2k, KD 125k, KD 1.2M — never truncates with ellipsis
export function formatCurrencyCompact(
  value: number | null | undefined,
  locale: Locale = "en",
): string {
  if (value == null || Number.isNaN(value)) return "";
  const symbol = locale === "ar" ? "د.ك" : "KD";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  let num: string;
  if (abs >= 1_000_000) {
    num = `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  } else if (abs >= 1_000) {
    num = `${sign}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  } else {
    num = `${sign}${abs.toFixed(0)}`;
  }
  // Strip trailing ".0" e.g. "1.0k" → "1k"
  num = num.replace(/\.0([kM])$/, "$1");
  return locale === "ar" ? `${num} ${symbol}` : `${symbol} ${num}`;
}

/* ── Darb 2.0 ── */
/**
 * KWD money formatter — ALWAYS 3 decimal places (fils precision) and always
 * latin digits, per product decision. "KD 1,250.500" / "1,250.500 د.ك".
 * Accepts Prisma-Decimal strings as-is.
 */
export function formatKwd(
  amount: number | string | null | undefined,
  locale: Locale = "en",
): string {
  if (amount == null || amount === "") return "";
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(value)) return "";
  const num = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    useGrouping: true,
  }).format(value);
  return locale === "ar" ? `${num} د.ك` : `KD ${num}`;
}

export function formatPercent(
  value: number | null | undefined,
  locale: Locale = "en",
  fractionDigits: number = 0,
): string {
  if (value == null || Number.isNaN(value)) return "";
  return new Intl.NumberFormat(localeTag(locale), {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatRelativeTime(input: DateInput, locale: Locale = "en"): string {
  const d = toDate(input);
  if (!d) return "";
  const diffMs = d.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(localeTag(locale), { numeric: "auto" });
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (absMs < hour) return rtf.format(Math.round(diffMs / minute), "minute");
  if (absMs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  return rtf.format(Math.round(diffMs / day), "day");
}
