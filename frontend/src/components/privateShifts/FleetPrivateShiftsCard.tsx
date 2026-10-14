"use client";
// Revision 24 (#10) — the company's drivers on private shifts, with what each
// shift pays the company: billable hours times its hourly rate for that
// vehicle, after the on-time and stay-at-the-shop deductions.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SlidePanel from "@/components/shared/SlidePanel";
import { fleetPrivateShiftsApi } from "@/lib/privateShiftsApi";
import { kuwaitClock, kuwaitToday } from "@/types/privateShifts";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd, formatNumber } from "@/i18n/format";
import PrivateShiftDetailBody from "./PrivateShiftDetailBody";
import PrivateShiftStatusPill from "./PrivateShiftStatusPill";

export default function FleetPrivateShiftsCard() {
  const { t, locale } = useI18n();
  const [detailId, setDetailId] = useState<string | null>(null);
  const from = kuwaitToday(-30);
  const to = kuwaitToday(7);

  const listQuery = useQuery({
    queryKey: ["darb", "fleet", "private-shifts", from, to],
    queryFn: () => fleetPrivateShiftsApi.list({ from, to }),
  });
  const detailQuery = useQuery({
    queryKey: ["darb", "fleet", "private-shift", detailId],
    queryFn: () => fleetPrivateShiftsApi.detail(detailId!),
    enabled: !!detailId,
  });
  const rows = listQuery.data?.data ?? [];
  const totalPay = rows.reduce((sum, r) => sum + (r.fleetPayKwd ? Number(r.fleetPayKwd) : 0), 0);

  return (
    <section className="bg-card border border-sand-200 rounded-2xl shadow-soft px-5 py-4" data-testid="fleet-private-shifts">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-medium text-sand-900">{t("privateShifts.fleetShiftsTitle")}</h2>
          <p className="text-xs text-sand-600 mt-1">{t("privateShifts.fleetShiftsHint")}</p>
        </div>
        <p className="text-sm text-sand-900 tabular-nums" dir="ltr">
          {t("privateShifts.fleetShiftsTotal").replace("{amount}", formatKwd(totalPay.toFixed(3), locale))}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-sand-500 mt-3">{t("privateShifts.fleetShiftsNone")}</p>
      ) : (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead className="text-sand-600">
              <tr>
                <th className="text-start font-medium py-2">{t("privateShifts.day")}</th>
                <th className="text-start font-medium py-2">{t("privateShifts.shop")}</th>
                <th className="text-start font-medium py-2">{t("privateShifts.driver")}</th>
                <th className="text-start font-medium py-2">{t("privateShifts.status")}</th>
                <th className="text-end font-medium py-2">{t("privateShifts.billable")}</th>
                <th className="text-end font-medium py-2">{t("privateShifts.fleetPay")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-sand-50/60" onClick={() => setDetailId(r.id)}>
                  <td className="py-2 tabular-nums whitespace-nowrap" dir="ltr">
                    {r.date} {kuwaitClock(r.startAt)}
                  </td>
                  <td className="py-2">{r.vendor?.name ?? "n/a"} · {r.branch?.name ?? "n/a"}</td>
                  <td className="py-2">{r.driver?.name ?? "n/a"}</td>
                  <td className="py-2"><PrivateShiftStatusPill status={r.status} /></td>
                  <td className="py-2 text-end tabular-nums">
                    {r.billableMinutes == null
                      ? "n/a"
                      : t("privateShifts.minutes").replace("{n}", formatNumber(r.billableMinutes, locale))}
                  </td>
                  <td className="py-2 text-end tabular-nums" dir="ltr">
                    {r.fleetPayKwd ? formatKwd(r.fleetPayKwd, locale) : "n/a"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SlidePanel open={!!detailId} onClose={() => setDetailId(null)} title={t("privateShifts.detailTitle")}>
        {detailQuery.data ? (
          <PrivateShiftDetailBody shift={detailQuery.data} showVendorCharge={false} showFleetPay />
        ) : (
          <p className="text-sm text-sand-500">{t("common.loading")}</p>
        )}
      </SlidePanel>
    </section>
  );
}
