"use client";
// Revision 24 (#8) — one private shift and its money, shown to Darb, the shop
// and the delivery company. Each side sees its own figure: the shop what it
// is charged, the company what it is paid, Darb both.
//
// Before the shift is settled the figures are a running preview, labelled as
// such, so nobody reads a number that is still moving as the bill.
import type { PrivateShiftDetail } from "@/types/privateShifts";
import { kuwaitClock } from "@/types/privateShifts";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd, formatNumber } from "@/i18n/format";
import PrivateShiftStatusPill from "./PrivateShiftStatusPill";

export default function PrivateShiftDetailBody({
  shift,
  showVendorCharge,
  showFleetPay,
}: {
  shift: PrivateShiftDetail;
  showVendorCharge: boolean;
  showFleetPay: boolean;
}) {
  const { t, locale } = useI18n();
  const settled = !!shift.settledAt;
  const p = shift.preview;
  const minutes = (n: number | null | undefined) =>
    n == null ? "n/a" : t("privateShifts.minutes").replace("{n}", formatNumber(n, locale));

  const scheduled = settled ? shift.scheduledMinutes : p?.scheduledMinutes;
  const billable = settled ? shift.billableMinutes : p?.billableMinutes;
  const lateMin = settled ? shift.lateDeductionMinutes : p ? p.lateOrderMinutes + p.lateStartMinutes : null;
  const awayMin = settled ? shift.awayDeductionMinutes : p ? p.awayMinutes + p.earlyEndMinutes : null;
  const vendorRate = settled ? shift.vendorHourlyKwd : p?.vendorHourlyKwd;
  const fleetRate = settled ? shift.fleetHourlyKwd : p?.fleetHourlyKwd;
  const charge = settled ? shift.vendorChargeKwd : p?.vendorChargeKwd;
  const pay = settled ? shift.fleetPayKwd : p?.fleetPayKwd;
  const deductions = settled ? shift.deductions : (p?.deductions ?? []);

  const row = (label: string, value: React.ReactNode, strong = false) => (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-sand-600">{label}</span>
      <span className={strong ? "text-sm font-medium text-sand-900 tabular-nums" : "text-sm text-sand-900 tabular-nums"}>
        {value}
      </span>
    </div>
  );

  return (
    <div className="space-y-5" data-testid="private-shift-detail">
      <div className="flex flex-wrap items-center gap-2">
        <PrivateShiftStatusPill status={shift.status} />
        <span className="text-sm text-sand-700 tabular-nums" dir="ltr">
          {shift.date} · {t("privateShifts.timeRange").replace("{from}", kuwaitClock(shift.startAt)).replace("{to}", kuwaitClock(shift.endAt))}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-sand-500">{t("privateShifts.shop")}</dt>
          <dd className="text-sand-900">{shift.vendor?.name ?? "n/a"} · {shift.branch?.name ?? "n/a"}</dd>
        </div>
        <div>
          <dt className="text-xs text-sand-500">{t("privateShifts.vehicle")}</dt>
          <dd className="text-sand-900">{t(`privateShifts.vehicle_${shift.vehicleType}`)}</dd>
        </div>
        <div>
          <dt className="text-xs text-sand-500">{t("privateShifts.driver")}</dt>
          <dd className="text-sand-900">
            {shift.driver ? `${shift.driver.name}${shift.driver.driverCode ? ` (${shift.driver.driverCode})` : ""}` : "n/a"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-sand-500">{t("privateShifts.company")}</dt>
          <dd className="text-sand-900">{shift.fleetPartner?.name ?? "n/a"}</dd>
        </div>
      </dl>

      <section className="rounded-2xl border border-sand-200 px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-medium text-sand-900">{t("privateShifts.billingTitle")}</h3>
          <span className="text-[11px] text-sand-500">
            {settled ? t("privateShifts.settled") : t("privateShifts.runningPreview")}
          </span>
        </div>
        {row(t("privateShifts.scheduled"), minutes(scheduled))}
        {row(t("privateShifts.lateDeduction"), minutes(lateMin))}
        {row(t("privateShifts.awayDeduction"), minutes(awayMin))}
        {row(t("privateShifts.billable"), minutes(billable), true)}
        {showVendorCharge &&
          row(
            t("privateShifts.vendorCharge"),
            charge == null ? t("privateShifts.noRate") : (
              <span dir="ltr">
                {formatKwd(charge, locale)}
                {vendorRate ? ` (${formatKwd(vendorRate, locale)} ${t("privateShifts.perHour")})` : ""}
              </span>
            ),
            true,
          )}
        {showFleetPay &&
          row(
            t("privateShifts.fleetPay"),
            pay == null ? t("privateShifts.noRate") : (
              <span dir="ltr">
                {formatKwd(pay, locale)}
                {fleetRate ? ` (${formatKwd(fleetRate, locale)} ${t("privateShifts.perHour")})` : ""}
              </span>
            ),
            true,
          )}
        <p className="text-xs text-sand-500 mt-2">{t("privateShifts.billingRule")}</p>
      </section>

      <section>
        <h3 className="text-sm font-medium text-sand-900 mb-2">{t("privateShifts.deductionsTitle")}</h3>
        {deductions.length === 0 ? (
          <p className="text-sm text-sand-500">{t("privateShifts.noDeductions")}</p>
        ) : (
          <ul className="divide-y divide-sand-100 border border-sand-200 rounded-2xl">
            {deductions.map((d, i) => (
              <li key={i} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-sand-800">
                  {t(`privateShifts.kind_${d.kind}`)}
                  {d.orderId ? ` · ${shift.orders.find((o) => o.id === d.orderId)?.orderNumber ?? ""}` : ""}
                  {d.fromAt && d.toAt && d.kind === "AWAY" ? (
                    <span className="text-sand-500 tabular-nums" dir="ltr">
                      {" "}
                      {t("privateShifts.timeRange").replace("{from}", kuwaitClock(d.fromAt)).replace("{to}", kuwaitClock(d.toAt))}
                    </span>
                  ) : null}
                </span>
                <span className="text-sand-900 tabular-nums">{minutes(d.minutes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium text-sand-900 mb-2">{t("privateShifts.ordersTitle")}</h3>
        <p className="text-sm text-sand-600 mb-2">
          {t("privateShifts.kpiLine")
            .replace("{delivered}", formatNumber(shift.kpis.delivered, locale))
            .replace("{onTime}", formatNumber(shift.kpis.onTime, locale))
            .replace("{rate}", shift.kpis.onTimeRate == null ? "n/a" : `${shift.kpis.onTimeRate}%`)}
        </p>
        {shift.orders.length > 0 && (
          <ul className="divide-y divide-sand-100 border border-sand-200 rounded-2xl">
            {shift.orders.map((o) => (
              <li key={o.id} className="px-4 py-2 flex items-center justify-between text-sm">
                <span className="text-sand-900 tabular-nums" dir="ltr">{o.orderNumber}</span>
                <span className="text-sand-600 tabular-nums" dir="ltr">
                  {o.deliveredAt ? kuwaitClock(o.deliveredAt) : o.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
