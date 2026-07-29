// Darb 2.0 — mm:ss countdown to an SLA deadline, driven by the shared 1Hz
// ticker. Tone: green >10min, amber 3–10min, red <3min or breached.
//
// Past the deadline the units change. mm:ss is the right resolution while you
// can still save the order, but it keeps counting after nobody can, and a
// stalled order that sat over a weekend rendered "-8459:30" — a number with no
// information in it that was also the loudest thing on the ops screen. Past an
// hour it reads "2h late", past a day "6d late".
"use client";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";
import { useSlaTick } from "./useSlaTick";

const TEN_MIN = 10 * 60_000;
const THREE_MIN = 3 * 60_000;
const ONE_HOUR = 60 * 60_000;
const ONE_DAY = 24 * ONE_HOUR;

interface SlaCountdownProps {
  deadline: string | Date | null | undefined;
  className?: string;
}

export default function SlaCountdown({ deadline, className }: SlaCountdownProps) {
  const now = useSlaTick();
  const { t } = useI18n();

  if (!deadline) {
    return (
      <span dir="ltr" className={cn("tabular-nums text-sand-500", className)}>
        —
      </span>
    );
  }

  const target = deadline instanceof Date ? deadline.getTime() : new Date(deadline).getTime();
  if (!Number.isFinite(target)) {
    return (
      <span dir="ltr" className={cn("tabular-nums text-sand-500", className)}>
        —
      </span>
    );
  }

  const remaining = target - now;
  const breached = remaining <= 0;
  const abs = Math.abs(remaining);

  let text: string;
  if (breached && abs >= ONE_DAY) {
    text = `${Math.floor(abs / ONE_DAY)}${t("opsMap.lateDays")}`;
  } else if (breached && abs >= ONE_HOUR) {
    text = `${Math.floor(abs / ONE_HOUR)}${t("opsMap.lateHours")}`;
  } else {
    const totalSeconds = Math.floor(abs / 1000);
    const mm = Math.floor(totalSeconds / 60);
    const ss = totalSeconds % 60;
    text = `${breached ? "-" : ""}${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }

  const tone =
    breached || remaining < THREE_MIN
      ? "text-red-600"
      : remaining < TEN_MIN
        ? "text-amber-600"
        : "text-green-700";

  return (
    <span dir="ltr" className={cn("font-medium tabular-nums", tone, className)}>
      {text}
    </span>
  );
}
