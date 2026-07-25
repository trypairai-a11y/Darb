"use client";
import { useState } from "react";
import { useApiGet } from "@/hooks/useApi";
import StatCard from "@/components/shared/StatCard";
import { cn } from "@/lib/cn";
import { Clock, Users, Timer } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { formatTime, formatNumber } from "@/i18n/format";

interface ShiftSession {
  id: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number;
  area: string | null;
  isOnline: boolean;
  availability: string;
}

interface ShiftDriver {
  driverId: string;
  name: string;
  phone: string | null;
  sessions: ShiftSession[];
  totalMinutes: number;
  firstStart: string | null;
  lastEnd: string | null;
  onlineNow: boolean;
}

interface ShiftsResponse {
  date: string;
  summary: { onlineNow: number; driversOnShift: number; totalHours: number };
  drivers: ShiftDriver[];
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function ShiftsPage() {
  const { t, locale } = useI18n();
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));

  const { data, loading } = useApiGet<ShiftsResponse>(`/api/drivers/shifts?date=${date}`);
  const drivers = data?.drivers || [];
  const summary = data?.summary;

  return (
    <div className="space-y-6 w-full max-w-none">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">{t("shiftsPage.title")}</h1>
          <p className="text-sm text-secondary mt-1">{t("shiftsPage.subtitle")}</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label={t("shiftsPage.date")}
          className="px-3 py-2 rounded-xl border border-sand-200 dark:border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title={t("shiftsPage.onlineNow")}
          value={formatNumber(summary?.onlineNow || 0, locale)}
          icon={Clock}
          highlight={(summary?.onlineNow || 0) > 0}
        />
        <StatCard
          title={t("shiftsPage.driversOnShift")}
          value={formatNumber(summary?.driversOnShift || 0, locale)}
          icon={Users}
        />
        <StatCard
          title={t("shiftsPage.totalHours")}
          value={formatNumber(summary?.totalHours || 0, locale)}
          icon={Timer}
        />
      </div>

      <div className="bg-card border border-sand-200 dark:border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sand-200 dark:border-border text-start text-[11px] uppercase tracking-[0.12em] text-sand-600">
                <th className="text-start font-medium px-5 py-3">{t("shiftsPage.driver")}</th>
                <th className="text-start font-medium px-5 py-3">{t("shiftsPage.start")}</th>
                <th className="text-start font-medium px-5 py-3">{t("shiftsPage.finish")}</th>
                <th className="text-start font-medium px-5 py-3">{t("shiftsPage.duration")}</th>
                <th className="text-start font-medium px-5 py-3">{t("shiftsPage.area")}</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) =>
                driver.sessions.map((session, idx) => (
                  <tr
                    key={session.id}
                    className="border-b border-sand-100 dark:border-border/50 last:border-0 hover:bg-sand-50/60 dark:hover:bg-sand-900/20"
                  >
                    <td className="px-5 py-3">
                      {idx === 0 ? (
                        <div className="min-w-0">
                          <div className="font-medium text-sand-900 dark:text-foreground truncate">
                            {driver.name}
                            {driver.sessions.length > 1 && (
                              <span className="ms-2 text-xs text-sand-500">
                                ({driver.sessions.length} {t("shiftsPage.sessions")})
                              </span>
                            )}
                          </div>
                          {driver.phone && (
                            <div className="text-xs text-sand-500 truncate" dir="ltr">
                              {driver.phone}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sand-400 ps-4">↳</span>
                      )}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-sand-700 dark:text-foreground/80">
                      {formatTime(session.startTime, locale)}
                    </td>
                    <td className="px-5 py-3">
                      {session.isOnline ? (
                        <span className="inline-flex items-center gap-1.5 rounded-pill bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 px-2.5 py-0.5 text-xs font-medium">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                          {t("shiftsPage.onlineNowBadge")}
                        </span>
                      ) : (
                        <span className="tabular-nums text-sand-700 dark:text-foreground/80">
                          {session.endTime ? formatTime(session.endTime, locale) : "n/a"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-sand-700 dark:text-foreground/80">
                      {formatDuration(session.durationMinutes)}
                    </td>
                    <td className="px-5 py-3 text-sand-600">{session.area || "n/a"}</td>
                  </tr>
                ))
              )}
              {!loading && drivers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sand-500">
                    {t("shiftsPage.noShifts")}
                  </td>
                </tr>
              )}
              {loading && drivers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sand-400">
                    …
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
