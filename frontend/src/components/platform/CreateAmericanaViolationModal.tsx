"use client";

import { useMemo, useState } from "react";
import api from "@/lib/api";
import { useApiGet } from "@/hooks/useApi";
import { X, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { cleanDriverName } from "@/lib/formatters";
import { useI18n } from "@/i18n/I18nProvider";

type AmericanaViolationType =
  | "AMERICANA_LATE_ARRIVAL"
  | "AMERICANA_NO_SHOW"
  | "AMERICANA_EARLY_DEPARTURE_QUIT";

interface CreateAmericanaViolationModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function CreateAmericanaViolationModal({
  onClose,
  onSuccess,
}: CreateAmericanaViolationModalProps) {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";

  const [driverId, setDriverId] = useState<string>("");
  const [driverQuery, setDriverQuery] = useState<string>("");
  const [violationType, setViolationType] =
    useState<AmericanaViolationType>("AMERICANA_LATE_ARRIVAL");
  const [violationTime, setViolationTime] = useState<string>(
    toLocalInputValue(new Date())
  );
  const [details, setDetails] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const driversUrl = `/api/drivers?platform=AMERICANA&limit=200${
    driverQuery ? `&search=${encodeURIComponent(driverQuery)}` : ""
  }`;
  const { data: driversData, loading: driversLoading } = useApiGet<any>(driversUrl);
  const drivers = useMemo(() => driversData?.data || [], [driversData]);
  const selectedDriver = drivers.find((d: any) => d.id === driverId);

  const VIOLATION_TYPE_OPTIONS: { value: AmericanaViolationType; label: string }[] = [
    { value: "AMERICANA_LATE_ARRIVAL", label: t("violationTypes.lateArrival") },
    { value: "AMERICANA_NO_SHOW", label: t("violationTypes.noShow") },
    { value: "AMERICANA_EARLY_DEPARTURE_QUIT", label: t("violationTypes.earlyQuit") },
  ];

  const canSubmit = !!driverId && !!violationType && !!violationTime;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/violations", {
        driverId,
        platform: "AMERICANA",
        violationType,
        violationTime: new Date(violationTime).toISOString(),
        details: details.trim() || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          err?.message ||
          (isAr ? "تعذر إنشاء المخالفة" : "Failed to create violation")
      );
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200";
  const labelClass = "block text-xs font-medium text-secondary mb-1";

  return (
    <div
      className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-lg w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold">
              {isAr ? "إنشاء مخالفة" : "Create Violation"}
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              {isAr
                ? "أمريكانا — تسجيل مخالفة يدوية"
                : "Americana — log a manual violation"}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-50 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Violation Type */}
          <div>
            <label className={labelClass}>
              {isAr ? "نوع المخالفة *" : "Violation type *"}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {VIOLATION_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setViolationType(opt.value)}
                  className={cn(
                    "px-3 py-2 rounded-xl border text-xs font-medium transition-colors",
                    violationType === opt.value
                      ? "border-americana bg-americana/5 text-americana"
                      : "border-gray-200 hover:bg-gray-50 text-secondary"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Driver */}
          <div>
            <label className={labelClass}>
              {isAr ? "المندوب *" : "Driver *"}
            </label>
            <div className="relative mb-2">
              <Search
                size={14}
                className="absolute top-1/2 -translate-y-1/2 start-3 text-secondary"
              />
              <input
                type="text"
                value={driverQuery}
                onChange={(e) => setDriverQuery(e.target.value)}
                className={cn(inputClass, "ps-9")}
                placeholder={
                  isAr ? "ابحث بالاسم أو رقم المندوب…" : "Search by name or driver ID…"
                }
              />
            </div>
            <div className="border border-gray-200 rounded-xl max-h-52 overflow-y-auto">
              {driversLoading && drivers.length === 0 ? (
                <div className="p-4 text-center text-xs text-secondary">
                  {t("common.loading")}
                </div>
              ) : drivers.length === 0 ? (
                <div className="p-4 text-center text-xs text-secondary">
                  {isAr ? "لا يوجد مندوبون" : "No drivers found"}
                </div>
              ) : (
                drivers.slice(0, 50).map((d: any) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDriverId(d.id)}
                    className={cn(
                      "w-full text-start px-3 py-2 border-b border-gray-50 last:border-0 transition-colors flex items-center justify-between gap-3",
                      driverId === d.id
                        ? "bg-americana/5"
                        : "hover:bg-gray-50"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {cleanDriverName(d.name) || "—"}
                      </p>
                      <p className="text-xs text-secondary truncate">
                        {d.platformDriverId || ""} · {d.vehicleType || "—"}
                      </p>
                    </div>
                    {driverId === d.id && (
                      <span className="text-[10px] font-semibold text-americana bg-americana/10 px-2 py-0.5 rounded-md">
                        {isAr ? "محدد" : "Selected"}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
            {selectedDriver && (
              <p className="text-xs text-secondary mt-1">
                {isAr ? "محدد:" : "Selected:"}{" "}
                <span className="font-medium text-foreground">
                  {cleanDriverName(selectedDriver.name)}
                </span>
              </p>
            )}
          </div>

          {/* Violation Time */}
          <div>
            <label className={labelClass}>
              {isAr ? "وقت المخالفة *" : "Violation time *"}
            </label>
            <input
              type="datetime-local"
              value={violationTime}
              onChange={(e) => setViolationTime(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Details */}
          <div>
            <label className={labelClass}>
              {isAr ? "ملاحظات" : "Details"}
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              className={cn(inputClass, "resize-none")}
              placeholder={
                isAr
                  ? "اختياري — وصف موجز للحادثة"
                  : "Optional — brief description of the incident"
              }
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={submitting || !canSubmit}
            onClick={handleSubmit}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-americana text-white text-sm font-medium rounded-xl hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting
              ? isAr
                ? "جارٍ الحفظ…"
                : "Saving…"
              : isAr
              ? "إنشاء المخالفة"
              : "Create Violation"}
          </button>
        </div>
      </div>
    </div>
  );
}
