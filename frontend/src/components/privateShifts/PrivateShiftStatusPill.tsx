"use client";
import type { PrivateShiftStatus } from "@/types/privateShifts";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";

const TONE: Record<PrivateShiftStatus, string> = {
  PROPOSED: "bg-primary/10 text-primary",
  OPEN: "bg-amber-100 text-amber-800",
  BOOKED: "bg-sky-100 text-sky-800",
  IN_PROGRESS: "bg-forest-100 text-forest-700",
  COMPLETED: "bg-sand-200 text-sand-700",
  CANCELLED: "bg-sand-100 text-sand-500",
};

export default function PrivateShiftStatusPill({ status }: { status: PrivateShiftStatus }) {
  const { t } = useI18n();
  return (
    <span className={cn("px-3 h-7 inline-flex items-center rounded-pill text-xs font-medium", TONE[status])}>
      {t(`privateShifts.status_${status}`)}
    </span>
  );
}
