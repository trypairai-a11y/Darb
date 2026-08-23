"use client";
// Darb 2.0 PRD build — /fleet-portal/payouts: monthly payout statements plus
// the running current-month earnings (delivered orders x flat fee) with a
// per-order breakdown and CSV export.
//
// Revision 13 (#8) — Darb used to move a statement from Final to Paid on its
// own. The delivery company confirms the figure first now, or disputes it with
// a reason that opens a Payout request carrying the numbers. postFleetPayout
// refuses an unconfirmed statement, so this is the gate and not a courtesy.
//
// Revision 13b, after the client saw it: a row is not enough to confirm from.
// Opening one shows the orders the total was built from, and confirming means
// attaching the company's own stamped invoice. A click is a claim; the stamped
// invoice is the document Darb files against the transfer, so the file is
// required and the status only moves once it is stored.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, FileText, MessageSquareWarning, Printer, Upload } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import { fleetApi } from "@/lib/darbApi";
import { downloadCsv } from "@/lib/csv";
import type { FleetInvoiceUpload, FleetStatementRow } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd, formatNumber, localeTag } from "@/i18n/format";

export default function FleetPayoutsPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [openRow, setOpenRow] = useState<FleetStatementRow | null>(null);
  const [disputing, setDisputing] = useState<FleetStatementRow | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

  // Only for the row that is open. The list endpoint stays a list.
  const detailQuery = useQuery({
    queryKey: ["darb", "fleet", "statement", openRow?.id],
    queryFn: () => fleetApi.statementDetail(openRow!.id),
    enabled: !!openRow,
  });

  const statementsQuery = useQuery({
    queryKey: ["darb", "fleet", "statements"],
    queryFn: () => fleetApi.statements(),
  });
  const earningsQuery = useQuery({
    queryKey: ["darb", "fleet", "earnings"],
    queryFn: () => fleetApi.earnings(),
  });

  if (statementsQuery.isLoading || earningsQuery.isLoading) {
    return <PageSkeleton statCards={0} tableRows={6} tableCols={5} />;
  }
  if (statementsQuery.error) {
    return (
      <ErrorState
        error={
          statementsQuery.error instanceof Error
            ? statementsQuery.error.message
            : t("errors.loadingData")
        }
        onRetry={() => statementsQuery.refetch()}
      />
    );
  }

  const statements = statementsQuery.data ?? [];
  const earnings = earningsQuery.data;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "statements"] });

  const fail = (err: unknown) =>
    toast.error(
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave"),
    );

  /**
   * Read the stamped invoice into base64.
   *
   * The bytes travel inline because production has no file storage yet. The
   * server takes an R2 object key instead the moment there is one, and nothing
   * on this screen changes when that happens.
   */
  function readFile(file: File): Promise<FleetInvoiceUpload> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(t("toast.failedSave")));
      reader.onload = () =>
        resolve({
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          dataBase64: String(reader.result ?? ""),
        });
      reader.readAsDataURL(file);
    });
  }

  async function confirm(row: FleetStatementRow) {
    if (!invoiceFile && !row.invoice) return;
    setSaving(true);
    try {
      await fleetApi.confirmStatement(
        row.id,
        invoiceFile ? await readFile(invoiceFile) : undefined,
      );
      toast.success(t("fleetPortal.statementConfirmed"));
      setInvoiceFile(null);
      setOpenRow(null);
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  /** The driver report as a spreadsheet. */
  function exportDriverReport(row: FleetStatementRow) {
    const rows = detailQuery.data?.byDriver ?? [];
    downloadCsv(
      `statement-${row.periodStart.slice(0, 7)}`,
      [
        t("fleetPortal.driverName"),
        t("fleetPortal.darbId"),
        t("fleetPortal.orders"),
        t("fleetPortal.distanceKm"),
        t("fleetPortal.total"),
      ],
      [
        ...rows.map((d) => [
          d.name,
          d.driverCode ?? "n/a",
          String(d.orders),
          d.totalKm ?? "n/a",
          d.totalKwd,
        ]),
        [
          t("fleetPortal.total"),
          "",
          String(row.deliveredOrders),
          row.totalKm ?? "n/a",
          row.totalKwd,
        ],
      ],
    );
  }

  /**
   * The statement as a page, for printing or saving to PDF.
   *
   * This is the document the delivery company stamps and hands back, so it has
   * to look like a statement rather than a screenshot of a panel: its own
   * window with its own stylesheet, no rail, no buttons, and a signature line.
   * A CSV cannot be stamped and a screenshot is not a document.
   */
  function printStatement(row: FleetStatementRow) {
    const rows = detailQuery.data?.byDriver ?? [];
    const esc = (v: string) =>
      v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const period = monthLabel(row.periodStart);
    // The kilometre column appears only on a month that was cut with a
    // kilometre rate. Printing an empty column on a flat month would make the
    // stamped document ask a question it has no answer to.
    const perKm = row.perKmFeeKwd != null;
    const kmCell = (km: string | null) =>
      perKm ? `<td class="num">${esc(km == null ? "n/a" : km)}</td>` : "";
    const body = rows
      .map(
        (d) => `<tr><td>${esc(d.name)}</td><td class="mono">${esc(d.driverCode ?? "n/a")}</td>` +
          `<td class="num">${d.orders}</td>${kmCell(d.totalKm)}` +
          `<td class="num">${esc(formatKwd(d.totalKwd, locale))}</td></tr>`,
      )
      .join("");

    const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
    if (!win) { toast.error(t("fleetPortal.printBlocked")); return; }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${esc(period)} — ${esc(t("fleetPortal.payoutsTitle"))}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 13px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; color: #1b1a17; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .sub { color: #6b6660; font-size: 12px; margin: 0 0 20px; }
  .totals { display: flex; gap: 28px; margin: 0 0 22px; }
  .totals div span { display: block; color: #6b6660; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
  .totals div b { font-size: 17px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #6b6660; border-bottom: 1px solid #d9d4cc; padding: 7px 8px; }
  td { padding: 7px 8px; border-bottom: 1px solid #efece7; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, Menlo, monospace; color: #6b6660; font-size: 12px; }
  tfoot td { border-top: 2px solid #1b1a17; border-bottom: none; font-weight: 600; padding-top: 10px; }
  .sign { margin-top: 46px; display: flex; gap: 60px; }
  .sign div { flex: 1; border-top: 1px solid #1b1a17; padding-top: 6px; font-size: 11px; color: #6b6660; }
  @media print { body { margin: 14mm; } }
</style></head><body>
<h1>${esc(period)}</h1>
<p class="sub">${esc(t("fleetPortal.payoutsTitle"))} &middot; Darb</p>
<div class="totals">
  <div><span>${esc(t("fleetPortal.orders"))}</span><b>${row.deliveredOrders}</b></div>
  <div><span>${esc(t("fleetPortal.rateBaseLabel"))}</span><b>${esc(formatKwd(row.feePerOrderKwd, locale))}</b></div>
  ${perKm ? `<div><span>${esc(t("fleetPortal.ratePerKmLabel"))}</span><b>${esc(formatKwd(row.perKmFeeKwd as string, locale))}</b></div>
  <div><span>${esc(t("fleetPortal.totalDistance"))}</span><b>${esc(row.totalKm ?? "0")} km</b></div>` : ""}
  <div><span>${esc(t("fleetPortal.total"))}</span><b>${esc(formatKwd(row.totalKwd, locale))}</b></div>
</div>
<table>
  <thead><tr>
    <th>${esc(t("fleetPortal.driverName"))}</th>
    <th>${esc(t("fleetPortal.darbId"))}</th>
    <th class="num">${esc(t("fleetPortal.orders"))}</th>
    ${perKm ? `<th class="num">${esc(t("fleetPortal.distanceKm"))}</th>` : ""}
    <th class="num">${esc(t("fleetPortal.total"))}</th>
  </tr></thead>
  <tbody>${body}</tbody>
  <tfoot><tr><td colspan="2">${esc(t("fleetPortal.total"))}</td>
    <td class="num">${row.deliveredOrders}</td>
    ${perKm ? `<td class="num">${esc(row.totalKm ?? "0")}</td>` : ""}
    <td class="num">${esc(formatKwd(row.totalKwd, locale))}</td></tr></tfoot>
</table>
<div class="sign"><div>${esc(t("fleetPortal.companyStamp"))}</div><div>${esc(t("fleetPortal.dateSigned"))}</div></div>
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  /** Open the stored invoice. Fetched with the bearer token, then shown. */
  async function viewInvoice(id: string) {
    try {
      const { objectUrl } = await fleetApi.statementInvoice(id);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      fail(err);
    }
  }

  async function dispute() {
    if (!disputing) return;
    setSaving(true);
    try {
      await fleetApi.disputeStatement(disputing.id, reason.trim());
      toast.success(t("fleetPortal.statementDisputed"));
      setDisputing(null);
      // The panel holds a snapshot of the row, so leaving it open kept showing
      // FINAL and kept offering Dispute — and the second click opened a second
      // support ticket.
      setOpenRow(null);
      setReason("");
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  const monthLabel = (iso: string) =>
    new Intl.DateTimeFormat(localeTag(locale), { year: "numeric", month: "long" }).format(
      new Date(iso)
    );

  function exportEarnings() {
    if (!earnings) return;
    downloadCsv(
      "fleet-earnings",
      [
        t("dispatch.orderNumber"),
        t("fleetPortal.driverName"),
        t("darbOrderStatus.delivered"),
        t("fleetPortal.distanceKm"),
        t("fleetPortal.feePerOrder"),
      ],
      earnings.orders.map((o) => [
        o.orderNumber,
        o.driverName ?? "n/a",
        o.deliveredAt,
        o.distanceKm ?? "n/a",
        o.feeKwd,
      ])
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">
          {t("fleetPortal.payoutsTitle")}
        </h1>
      </div>

      {/* Revision 14 (#2): the company's own price per order. It was already on
          screen inside the earnings line, but only as a number to read. It sits
          above the statements because it is the figure every total below is
          built from. */}
      <FleetRateCard />

      <DataTable
        columns={[
          {
            key: "periodStart",
            label: t("fleetPortal.period"),
            render: (value: string) => <span dir="ltr">{monthLabel(value)}</span>,
          },
          { key: "deliveredOrders", label: t("fleetPortal.orders") },
          {
            // The rate the month was cut on. A single figure here is what let
            // the client read the whole deal as a flat price per order, so the
            // kilometre half sits beside it wherever a month carries one.
            key: "feePerOrderKwd",
            label: t("fleetPortal.feePerOrder"),
            render: (value: string, row: FleetStatementRow) => (
              <span dir="ltr" className="tabular-nums">
                {formatKwd(value, locale)}
                {row.perKmFeeKwd != null && (
                  <span className="text-sand-600">
                    {" + "}
                    {formatKwd(row.perKmFeeKwd, locale)}/km
                  </span>
                )}
              </span>
            ),
          },
          {
            key: "totalKwd",
            label: t("fleetPortal.total"),
            render: (value: string) => (
              <span dir="ltr" className="tabular-nums font-medium">{formatKwd(value, locale)}</span>
            ),
          },
          {
            key: "status",
            label: t("fleetPortal.statementStatus"),
            render: (value: string, row: FleetStatementRow) => (
              <span className="inline-flex items-center gap-2">
                <StatusBadge status={value} />
                {value === "DISPUTED" && row.disputeReason && (
                  <span className="text-xs text-red-600" dir="auto">{row.disputeReason}</span>
                )}
              </span>
            ),
          },
          {
            // One action, and it opens the working. Confirming from a row was
            // the client's objection: nobody signs an invoice they have not
            // read, and the orders behind the total are the invoice.
            key: "id",
            label: "",
            sortable: false,
            render: (_v: unknown, row: FleetStatementRow) => (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setOpenRow(row); setInvoiceFile(null); }}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200"
                >
                  <FileText size={12} aria-hidden="true" />
                  {row.status === "PAID" || row.status === "CONFIRMED"
                    ? t("fleetPortal.viewStatement")
                    : t("fleetPortal.reviewAndConfirm")}
                </button>
                {row.status === "CONFIRMED" && (
                  <span className="text-xs text-sand-500">{t("fleetPortal.awaitingDarb")}</span>
                )}
              </span>
            ),
          },
        ]}
        data={statements}
        onRowClick={(row: FleetStatementRow) => { setOpenRow(row); setInvoiceFile(null); }}
        emptyMessage={t("fleetPortal.noStatements")}
      />

      <p className="text-xs text-sand-600" dir="auto">
        {t("fleetPortal.confirmHint")}
      </p>

      {/* Current month earnings */}
      {earnings && (
        <section className="bg-card border border-sand-200 rounded-2xl shadow-soft">
          <header className="px-5 py-4 border-b border-sand-200 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-medium text-sand-900">{t("fleetPortal.earningsTitle")}</h2>
              {/* The working, not just the answer. With a kilometre half the
                  total stops being a number anyone can check in their head,
                  so both terms are printed. */}
              <p className="text-xs text-sand-600 mt-0.5" dir="ltr">
                {formatNumber(earnings.deliveredOrders, locale)} x{" "}
                {formatKwd(earnings.feePerOrderKwd, locale)}
                {earnings.perKmFeeKwd != null && (
                  <>
                    {" + "}
                    {formatNumber(Number(earnings.totalKm ?? 0), locale)} km x{" "}
                    {formatKwd(earnings.perKmFeeKwd, locale)}
                  </>
                )}{" "}
                ={" "}
                <span className="font-medium text-sand-900">
                  {formatKwd(earnings.totalKwd, locale)}
                </span>
              </p>
              {/* A base-only line is a difference the company would otherwise
                  find by hand, so the count says so on the screen. */}
              {earnings.ordersMissingDistance > 0 && (
                <p className="text-xs text-amber-700 mt-0.5" dir="auto">
                  {t("fleetPortal.noDistanceOrders").replace(
                    "{n}",
                    formatNumber(earnings.ordersMissingDistance, locale),
                  )}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={exportEarnings}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors"
            >
              <Download size={12} aria-hidden="true" />
              {t("table.exportCsv")}
            </button>
          </header>
          {earnings.orders.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-sand-600">{t("errors.noData")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-sand-200">
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">
                      {t("dispatch.orderNumber")}
                    </th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">
                      {t("fleetPortal.driverName")}
                    </th>
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">
                      {t("darbOrderStatus.delivered")}
                    </th>
                    {earnings.perKmFeeKwd != null && (
                      <th className="text-start text-xs font-medium text-secondary px-5 py-3">
                        {t("fleetPortal.distanceKm")}
                      </th>
                    )}
                    <th className="text-start text-xs font-medium text-secondary px-5 py-3">
                      {t("fleetPortal.feePerOrder")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {earnings.orders.map((o) => (
                    <tr key={o.id} className="border-b border-sand-200 last:border-0">
                      <td dir="ltr" className="px-5 py-3 text-sm font-mono">{o.orderNumber}</td>
                      <td dir="auto" className="px-5 py-3 text-sm">{o.driverName ?? "n/a"}</td>
                      <td dir="ltr" className="px-5 py-3 text-sm tabular-nums">
                        {formatDateTime(o.deliveredAt, locale)}
                      </td>
                      {earnings.perKmFeeKwd != null && (
                        <td dir="ltr" className="px-5 py-3 text-sm tabular-nums">
                          {o.distanceKm == null
                            ? "n/a"
                            : formatNumber(Number(o.distanceKm), locale)}
                        </td>
                      )}
                      <td dir="ltr" className="px-5 py-3 text-sm tabular-nums">
                        {formatKwd(o.feeKwd, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* The invoice itself: what the total is made of, then the stamped
          document that confirms it. Both in one panel, because the client's
          note was that confirming and reading the detail are one action. */}
      <SlidePanel
        open={openRow !== null}
        onClose={() => setOpenRow(null)}
        title={openRow ? monthLabel(openRow.periodStart) : t("fleetPortal.payoutsTitle")}
        subtitle={openRow ? formatKwd(openRow.totalKwd, locale) : undefined}
        wide
      >
        {openRow && (
          <div className="space-y-5">
            {/* The rate SNAPSHOTTED on this statement, so a month cut on a flat
                deal keeps reading as three boxes even after the company moves
                onto a kilometre rate. */}
            <div
              className={
                openRow.perKmFeeKwd == null
                  ? "grid grid-cols-3 gap-3"
                  : "grid grid-cols-2 sm:grid-cols-5 gap-3"
              }
            >
              {[
                { label: t("fleetPortal.orders"), value: formatNumber(openRow.deliveredOrders, locale) },
                { label: t("fleetPortal.rateBaseLabel"), value: formatKwd(openRow.feePerOrderKwd, locale) },
                ...(openRow.perKmFeeKwd == null
                  ? []
                  : [
                      {
                        label: t("fleetPortal.ratePerKmLabel"),
                        value: formatKwd(openRow.perKmFeeKwd, locale),
                      },
                      {
                        label: t("fleetPortal.totalDistance"),
                        value: `${formatNumber(Number(openRow.totalKm ?? 0), locale)} km`,
                      },
                    ]),
                { label: t("fleetPortal.total"), value: formatKwd(openRow.totalKwd, locale) },
              ].map((box) => (
                <div key={box.label} className="rounded-xl border border-sand-200 bg-white px-4 py-3">
                  <p className="text-xs text-sand-500">{box.label}</p>
                  <p className="text-lg font-display text-sand-900 tabular-nums" dir="ltr">
                    {box.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={openRow.status} />
              {openRow.status === "DISPUTED" && openRow.disputeReason && (
                <span className="text-xs text-red-600" dir="auto">{openRow.disputeReason}</span>
              )}
              {/* Once confirmed, the stamped invoice is the record. Reading it
                  back is how a company answers its own accountant. */}
              {detailQuery.data?.statement.invoice && (
                <button
                  type="button"
                  onClick={() => void viewInvoice(openRow.id)}
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <FileText size={12} aria-hidden="true" />
                  <span dir="auto">{detailQuery.data.statement.invoice.fileName}</span>
                </button>
              )}
            </div>

            {/* The working. A total nobody can take apart is a total nobody
                should be asked to sign. */}
            {detailQuery.isLoading ? (
              <p className="text-sm text-sand-600">{t("common.loading")}</p>
            ) : (
              <>
                {detailQuery.data &&
                  detailQuery.data.listedOrders !== detailQuery.data.countedOrders && (
                    <p className="px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800">
                      {t("fleetPortal.orderCountDrift")
                        .replace("{counted}", String(detailQuery.data.countedOrders))
                        .replace("{listed}", String(detailQuery.data.listedOrders))}
                    </p>
                  )}
                {/* The statement, and the only report on it. The order-by-order
                    list that used to sit underneath said the same thing at
                    four times the length: what a delivery company checks is
                    how many each driver did, and the total that follows from
                    it. The orders themselves are still in Earnings below. */}
                {(detailQuery.data?.byDriver ?? []).length > 0 && (
                  <div className="rounded-xl border border-sand-200 overflow-hidden">
                    {/* The download sits on the report it downloads. The
                        delivery company's own copy of this is what it stamps
                        and sends back, so it cannot be a button somebody has
                        to go looking for. */}
                    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-sand-50 border-b border-sand-200">
                      <p className="text-xs font-medium text-sand-700">
                        {t("fleetPortal.ordersByDriver")}
                      </p>
                      <span className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => printStatement(openRow)}
                          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-pill bg-white border border-sand-300 text-sand-800 text-[11px] font-medium hover:bg-sand-100"
                        >
                          <Printer size={11} aria-hidden="true" />
                          {t("fleetPortal.printStatement")}
                        </button>
                        <button
                          type="button"
                          onClick={() => exportDriverReport(openRow)}
                          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-pill bg-white border border-sand-300 text-sand-800 text-[11px] font-medium hover:bg-sand-100"
                        >
                          <Download size={11} aria-hidden="true" />
                          {t("table.exportCsv")}
                        </button>
                      </span>
                    </div>
                    <div className="max-h-[26rem] overflow-y-auto">
                      <table className="w-full">
                        <thead className="sticky top-0 bg-white">
                          <tr className="border-b border-sand-200">
                            <th className="text-start text-[11px] font-medium text-secondary px-3 py-2">
                              {t("fleetPortal.driverName")}
                            </th>
                            <th className="text-start text-[11px] font-medium text-secondary px-3 py-2">
                              {t("fleetPortal.darbId")}
                            </th>
                            <th className="text-end text-[11px] font-medium text-secondary px-3 py-2">
                              {t("fleetPortal.orders")}
                            </th>
                            {openRow.perKmFeeKwd != null && (
                              <th className="text-end text-[11px] font-medium text-secondary px-3 py-2">
                                {t("fleetPortal.distanceKm")}
                              </th>
                            )}
                            <th className="text-end text-[11px] font-medium text-secondary px-3 py-2">
                              {t("fleetPortal.total")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detailQuery.data?.byDriver ?? []).map((d) => (
                            <tr key={d.driverId} className="border-b border-sand-200 last:border-0">
                              <td dir="auto" className="px-3 py-2 text-xs">{d.name}</td>
                              <td dir="ltr" className="px-3 py-2 text-xs font-mono text-sand-500">
                                {d.driverCode ?? "n/a"}
                              </td>
                              <td dir="ltr" className="px-3 py-2 text-xs tabular-nums text-end">
                                {formatNumber(d.orders, locale)}
                              </td>
                              {openRow.perKmFeeKwd != null && (
                                <td dir="ltr" className="px-3 py-2 text-xs tabular-nums text-end">
                                  {d.totalKm == null
                                    ? "n/a"
                                    : formatNumber(Number(d.totalKm), locale)}
                                </td>
                              )}
                              <td dir="ltr" className="px-3 py-2 text-xs tabular-nums text-end font-medium">
                                {formatKwd(d.totalKwd, locale)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {/* The line the company is actually signing for. */}
                        <tfoot className="sticky bottom-0 bg-sand-50">
                          <tr className="border-t border-sand-300">
                            <td className="px-3 py-2 text-xs font-medium" colSpan={2}>
                              {t("fleetPortal.total")}
                            </td>
                            <td dir="ltr" className="px-3 py-2 text-xs tabular-nums text-end font-medium">
                              {formatNumber(openRow.deliveredOrders, locale)}
                            </td>
                            {openRow.perKmFeeKwd != null && (
                              <td dir="ltr" className="px-3 py-2 text-xs tabular-nums text-end font-medium">
                                {formatNumber(Number(openRow.totalKm ?? 0), locale)}
                              </td>
                            )}
                            <td dir="ltr" className="px-3 py-2 text-xs tabular-nums text-end font-medium">
                              {formatKwd(openRow.totalKwd, locale)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}


              </>
            )}

            {/* Confirming. Not a button on its own: the stamped invoice IS the
                confirmation, so the file comes first and the button follows. */}
            {openRow.status !== "PAID" && openRow.status !== "CONFIRMED" && (
              <div className="pt-4 border-t border-sand-200 space-y-3">
                <div>
                  <p className="text-sm font-medium text-sand-900">
                    {t("fleetPortal.stampedInvoice")}
                  </p>
                  <p className="text-xs text-sand-600 mt-0.5" dir="auto">
                    {t("fleetPortal.stampedInvoiceHint")}
                  </p>
                </div>

                <label className="flex items-center gap-2 h-10 px-3 rounded-xl border border-sand-300 text-sm text-sand-700 cursor-pointer hover:bg-sand-100">
                  <Upload size={15} aria-hidden="true" />
                  <span dir="auto">
                    {invoiceFile ? invoiceFile.name : t("fleetPortal.attachInvoice")}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {invoiceFile && invoiceFile.size > 3 * 1024 * 1024 && (
                  <p className="text-xs text-red-600">{t("fleetPortal.invoiceTooBig")}</p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={
                      saving || !invoiceFile || invoiceFile.size > 3 * 1024 * 1024
                    }
                    onClick={() => void confirm(openRow)}
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-50"
                  >
                    <Check size={14} aria-hidden="true" />
                    {saving ? t("common.processing") : t("fleetPortal.confirmPayout")}
                  </button>
                  {openRow.status !== "DISPUTED" && (
                    <button
                      type="button"
                      onClick={() => { setDisputing(openRow); setReason(""); }}
                      className="inline-flex items-center gap-1.5 h-10 px-4 rounded-pill border border-sand-300 text-sm font-medium text-sand-700 hover:bg-sand-100"
                    >
                      <MessageSquareWarning size={14} aria-hidden="true" />
                      {t("fleetPortal.disputePayout")}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </SlidePanel>

      {/* A dispute is a sentence Darb can act on, not a flag. The reason
          becomes the first message on a Payout request carrying the period,
          the order count and the total. */}
      <SlidePanel
        open={disputing !== null}
        onClose={() => setDisputing(null)}
        title={t("fleetPortal.disputePayout")}
        subtitle={disputing ? monthLabel(disputing.periodStart) : undefined}
      >
        <div className="space-y-4">
          <p className="text-sm text-sand-600" dir="auto">{t("fleetPortal.disputeHint")}</p>
          <label className="block">
            <span className="text-xs font-medium text-sand-700">
              {t("fleetPortal.disputeReason")}
            </span>
            <textarea
              rows={5}
              dir="auto"
              className="w-full px-3 py-2 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={saving || reason.trim().length < 10}
            onClick={() => void dispute()}
            className="w-full h-11 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? t("common.processing") : t("fleetPortal.disputePayout")}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}

/**
 * The company's own price per order, and the ask to change it (revision 14 #2).
 *
 * The client's note was "the delivery company will create its own price so make
 * it visible and adjustable". Visible it already was, buried in the earnings
 * line as `20 x KD 1.100`. Adjustable it was not, and it deliberately still is
 * not adjustable *directly*: this opens a request Darb approves, because a
 * company that could write its own rate live could raise what Darb pays it with
 * nobody approving it. The screen says so in as many words rather than letting
 * an owner press Send and wonder why the number did not move.
 */
function FleetRateCard() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [proposing, setProposing] = useState(false);
  const [amount, setAmount] = useState("");
  const [perKm, setPerKm] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);

  const rateQuery = useQuery({
    queryKey: ["darb", "fleet", "rate"],
    queryFn: () => fleetApi.rate(),
  });
  const rate = rateQuery.data;
  if (!rate) return null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "rate"] });

  async function send() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error(t("fleetPortal.ratePriceInvalid"));
      return;
    }
    // An empty kilometre box means "leave that half alone", never zero. A
    // company asking for a higher base must not give up its distance rate by
    // not retyping it (revision 14 #3).
    const km = perKm.trim();
    const kmNumber = Number(km);
    if (km !== "" && (!Number.isFinite(kmNumber) || kmNumber < 0)) {
      toast.error(t("fleetPortal.ratePerKmInvalid"));
      return;
    }
    setBusy(true);
    try {
      await fleetApi.proposeRate({
        flatFeePerOrderKwd: n.toFixed(3),
        ...(km === "" ? {} : { perKmFeeKwd: kmNumber.toFixed(3) }),
        reason: why.trim(),
      });
      toast.success(t("fleetPortal.rateRequestSent"));
      setProposing(false);
      setAmount("");
      setPerKm("");
      setWhy("");
      refresh();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          t("toast.failedSave"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: string) {
    setBusy(true);
    try {
      await fleetApi.withdrawRateRequest(id);
      toast.success(t("fleetPortal.rateRequestWithdrawn"));
      refresh();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          t("toast.failedSave"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="bg-card border border-sand-200 rounded-2xl shadow-soft px-5 py-4"
      data-testid="fleet-rate-card"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-medium text-sand-900">{t("fleetPortal.rateTitle")}</h2>
          {/* Both halves, side by side and labelled. One number with no label
              is what made the old card read as a flat per-order price. */}
          <div className="flex items-end gap-6 mt-1 flex-wrap">
            <div>
              <p className="text-[11px] text-sand-500 uppercase tracking-wide">
                {t("fleetPortal.rateBaseLabel")}
              </p>
              <p className="text-2xl font-display text-sand-900 tabular-nums" dir="ltr">
                {formatKwd(rate.currentKwd, locale)}
              </p>
            </div>
            {rate.currentPerKmKwd != null && (
              <div>
                <p className="text-[11px] text-sand-500 uppercase tracking-wide">
                  {t("fleetPortal.ratePerKmLabel")}
                </p>
                <p className="text-2xl font-display text-sand-900 tabular-nums" dir="ltr">
                  {formatKwd(rate.currentPerKmKwd, locale)}
                </p>
              </div>
            )}
          </div>
          <p className="text-xs text-sand-600 mt-1" dir="auto">
            {rate.currentPerKmKwd == null
              ? t("fleetPortal.rateFlatOnly")
              : t("fleetPortal.rateHint")}
          </p>
        </div>

        {/* Owner-only, and hidden rather than shown to answer 403. */}
        {rate.canPropose && !rate.pending && !proposing && (
          <button
            type="button"
            onClick={() => setProposing(true)}
            className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors"
          >
            {t("fleetPortal.ratePropose")}
          </button>
        )}
      </div>

      {/* An ask already in review. Shown with its own numbers so a second
          attempt is not the way an owner discovers the first one exists. */}
      {rate.pending && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="text-sm text-sand-900" dir="ltr">
            {formatKwd(rate.currentKwd, locale)} →{" "}
            <span className="font-medium">
              {formatKwd(rate.pending.proposedKwd ?? "0", locale)}
            </span>
          </p>
          {/* Only when the ask actually moved it. A proposal that touched the
              base alone must not read as one that zeroed the kilometre rate. */}
          {rate.pending.proposedPerKmKwd != null && (
            <p className="text-sm text-sand-900" dir="ltr">
              {t("fleetPortal.ratePerKmLabel")}:{" "}
              {formatKwd(rate.currentPerKmKwd ?? "0", locale)} →{" "}
              <span className="font-medium">
                {formatKwd(rate.pending.proposedPerKmKwd, locale)}
              </span>
            </p>
          )}
          <p className="text-xs text-sand-700 mt-0.5" dir="auto">
            {t("fleetPortal.rateAwaitingDarb")}
            {rate.pending.reason ? ` · ${rate.pending.reason}` : ""}
          </p>
          {rate.canPropose && (
            <button
              type="button"
              onClick={() => void withdraw(rate.pending!.id)}
              disabled={busy}
              className="mt-2 inline-flex items-center h-8 px-3 rounded-pill bg-white border border-sand-300 text-xs text-sand-800 hover:bg-sand-100 disabled:opacity-50"
            >
              {t("fleetPortal.rateWithdraw")}
            </button>
          )}
        </div>
      )}

      {proposing && (
        <div className="mt-3 space-y-3 border-t border-sand-200 pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-sand-700 uppercase tracking-wide mb-1.5">
                {t("fleetPortal.rateNewPrice")}
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                dir="ltr"
                value={amount}
                placeholder={rate.currentKwd}
                onChange={(e) => setAmount(e.target.value)}
                aria-label={t("fleetPortal.rateNewPrice")}
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-sand-700 uppercase tracking-wide mb-1.5">
                {t("fleetPortal.rateNewPerKm")}
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                dir="ltr"
                value={perKm}
                placeholder={rate.currentPerKmKwd ?? "0.000"}
                onChange={(e) => setPerKm(e.target.value)}
                aria-label={t("fleetPortal.rateNewPerKm")}
                data-testid="fleet-rate-per-km"
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-sand-700 uppercase tracking-wide mb-1.5">
                {t("fleetPortal.rateReason")}
              </label>
              <input
                type="text"
                dir="auto"
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                aria-label={t("fleetPortal.rateReason")}
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <p className="text-xs text-sand-600" dir="auto">
            {t("fleetPortal.ratePerKmHint")}
          </p>
          <p className="text-xs text-sand-600" dir="auto">
            {t("fleetPortal.rateApprovalHint")}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy}
              className="btn-primary inline-flex items-center gap-2 px-4 h-10 disabled:opacity-50"
            >
              {busy ? t("common.processing") : t("fleetPortal.rateSend")}
            </button>
            <button
              type="button"
              onClick={() => { setProposing(false); setAmount(""); setPerKm(""); setWhy(""); }}
              className="inline-flex items-center h-10 px-4 rounded-pill bg-sand-100 text-sand-800 text-sm font-medium hover:bg-sand-200"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
