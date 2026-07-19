// Darb 2.0 — mm:ss countdown to an SLA deadline, driven by the shared 1Hz
// ticker. Tone: green >10min, amber 3–10min, red <3min or breached.
"use client";
import { cn } from "@/lib/cn";
import { useSlaTick } from "./useSlaTick";

const TEN_MIN = 10 * 60_000;
const THREE_MIN = 3 * 60_000;

interface SlaCountdownProps {
  deadline: string | Date | null | undefined;
  className?: string;
}

export default function SlaCountdown({ deadline, className }: SlaCountdownProps) {
  const now = useSlaTick();

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
  const totalSeconds = Math.floor(abs / 1000);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  const text = `${breached ? "-" : ""}${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

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
