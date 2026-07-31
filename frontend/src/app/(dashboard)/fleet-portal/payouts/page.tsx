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
import { Check, Download, FileText, MessageSquareWarning, Upload } from "lucide-react";
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
        t("fleetPortal.feePerOrder"),
      ],
      earnings.orders.map((o) => [o.orderNumber, o.driverName ?? "n/a", o.deliveredAt, o.feeKwd])
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">
          {t("fleetPortal.payoutsTitle")}
        </h1>
      </div>

      <DataTable
        columns={[
          {
            key: "periodStart",
            label: t("fleetPortal.period"),
            render: (value: string) => <span dir="ltr">{monthLabel(value)}</span>,
          },
          { key: "deliveredOrders", label: t("fleetPortal.orders") },
          {
            key: "feePerOrderKwd",
            label: t("fleetPortal.feePerOrder"),
            render: (value: string) => (
              <span dir="ltr" className="tabular-nums">{formatKwd(value, locale)}</span>
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
              <p className="text-xs text-sand-600 mt-0.5" dir="ltr">
                {formatNumber(earnings.deliveredOrders, locale)} x{" "}
                {formatKwd(earnings.feePerOrderKwd, locale)} ={" "}
                <span className="font-medium text-sand-900">
                  {formatKwd(earnings.totalKwd, locale)}
                </span>
              </p>
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
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: t("fleetPortal.orders"), value: formatNumber(openRow.deliveredOrders, locale) },
                { label: t("fleetPortal.feePerOrder"), value: formatKwd(openRow.feePerOrderKwd, locale) },
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
                <div className="rounded-xl border border-sand-200 overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-sand-50">
                        <tr className="border-b border-sand-200">
                          <th className="text-start text-xs font-medium text-secondary px-3 py-2">
                            {t("dispatch.orderNumber")}
                          </th>
                          <th className="text-start text-xs font-medium text-secondary px-3 py-2">
                            {t("fleetPortal.driverName")}
                          </th>
                          <th className="text-start text-xs font-medium text-secondary px-3 py-2">
                            {t("darbOrderStatus.delivered")}
                          </th>
                          <th className="text-start text-xs font-medium text-secondary px-3 py-2">
                            {t("fleetPortal.feePerOrder")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detailQuery.data?.orders ?? []).map((o) => (
                          <tr key={o.id} className="border-b border-sand-200 last:border-0">
                            <td dir="ltr" className="px-3 py-2 text-xs font-mono">{o.orderNumber}</td>
                            <td dir="auto" className="px-3 py-2 text-xs">{o.driverName ?? "n/a"}</td>
                            <td dir="ltr" className="px-3 py-2 text-xs tabular-nums">
                              {formatDateTime(o.deliveredAt, locale)}
                            </td>
                            <td dir="ltr" className="px-3 py-2 text-xs tabular-nums">
                              {formatKwd(o.feeKwd, locale)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const rows = detailQuery.data?.orders ?? [];
                    downloadCsv(
                      `statement-${openRow.periodStart.slice(0, 7)}`,
                      [
                        t("dispatch.orderNumber"),
                        t("fleetPortal.driverName"),
                        t("darbOrderStatus.delivered"),
                        t("fleetPortal.feePerOrder"),
                      ],
                      rows.map((o) => [o.orderNumber, o.driverName ?? "n/a", o.deliveredAt, o.feeKwd]),
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200"
                >
                  <Download size={12} aria-hidden="true" />
                  {t("table.exportCsv")}
                </button>
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
