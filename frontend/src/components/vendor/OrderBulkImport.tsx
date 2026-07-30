"use client";
// Revision 10 (#1) — bulk order import, on /vendor/orders/new above the form.
//
// A pharmacy with twenty deliveries waiting was typing the same eight fields
// twenty times. Three steps, in the order the client described them: download a
// template, fill one row per order, bring it back.
//
// The template is generated server-side from THIS shop's own branches and the
// live zone list, on a second sheet, so what a merchant types is what the
// importer can resolve. Nothing here guesses: a file with a bad row imports
// nothing and says which rows, because a half-finished import is the one
// outcome a shop cannot reconcile against its own paperwork.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, TriangleAlert } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import { vendorApi } from "@/lib/darbApi";
import { downloadBlob } from "@/utils/downloadBlob";
import { useVendorBranch } from "@/contexts/VendorBranchContext";
import { useI18n } from "@/i18n/I18nProvider";
import type { OrderImportResult } from "@/types/darb";

export default function OrderBulkImport() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { branchId, inspectVendorId } = useVendorBranch();

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<OrderImportResult | null>(null);

  async function downloadTemplate() {
    setDownloading(true);
    try {
      await downloadBlob(
        vendorApi.orderImportTemplateUrl({ branchId, vendorId: inspectVendorId }),
        "darb-orders-template.xlsx",
      );
    } catch {
      toast.error(t("reportsPage.exportFailed"));
    } finally {
      setDownloading(false);
    }
  }

  async function importFile() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await vendorApi.bulkImportOrders(file);
      setResult(res);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      if (res.created > 0) {
        toast.success(`${res.created} ${t("vendorPortal.importDone")}`);
        await queryClient.invalidateQueries({ queryKey: ["darb", "vendor", "orders"] });
      }
    } catch (err) {
      // A 422 is not a failure to talk to the server, it is the server listing
      // the rows that need fixing. Show it as the report it is.
      const data = (err as { response?: { data?: OrderImportResult } })?.response?.data;
      if (data && Array.isArray(data.rows)) {
        setResult({ ...data, created: data.created ?? 0 });
      } else {
        toast.error(
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
            t("toast.failedSave"),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  const failed = (result?.rows ?? []).filter((r) => !r.ok);
  const nothingImported = result != null && result.created === 0;

  return (
    <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-pill bg-sand-100 flex items-center justify-center text-sand-700">
          <FileSpreadsheet size={16} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="font-medium text-sand-900">{t("vendorPortal.importTitle")}</h2>
          <p className="text-xs text-sand-600 mt-1">{t("vendorPortal.importHint")}</p>
        </div>
      </div>

      <ol className="space-y-3">
        <li className="flex items-center gap-3 flex-wrap">
          <span className="h-6 w-6 shrink-0 rounded-pill bg-sand-100 text-sand-700 text-xs font-medium flex items-center justify-center tabular-nums">
            1
          </span>
          <span className="text-sm text-sand-800 flex-1 min-w-[10rem]">
            {t("vendorPortal.importStep1")}
          </span>
          <button
            type="button"
            onClick={() => void downloadTemplate()}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            ) : (
              <Download size={12} aria-hidden="true" />
            )}
            {t("vendorPortal.importDownload")}
          </button>
        </li>

        <li className="flex items-center gap-3">
          <span className="h-6 w-6 shrink-0 rounded-pill bg-sand-100 text-sand-700 text-xs font-medium flex items-center justify-center tabular-nums">
            2
          </span>
          <span className="text-sm text-sand-800">
            {t("vendorPortal.importStep2")}
            <span className="block text-xs text-sand-500 mt-0.5">
              {t("vendorPortal.importMaxRows")}
            </span>
          </span>
        </li>

        <li className="flex items-center gap-3 flex-wrap">
          <span className="h-6 w-6 shrink-0 rounded-pill bg-sand-100 text-sand-700 text-xs font-medium flex items-center justify-center tabular-nums">
            3
          </span>
          <span className="text-sm text-sand-800 flex-1 min-w-[10rem]">
            {t("vendorPortal.importStep3")}
          </span>
          <div className="flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
              className="hidden"
              id="darb-order-import"
            />
            <label
              htmlFor="darb-order-import"
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors cursor-pointer"
            >
              <Upload size={12} aria-hidden="true" />
              {file ? t("vendorPortal.importSelected") : t("vendorPortal.importChoose")}
            </label>
            <button
              type="button"
              onClick={() => void importFile()}
              disabled={!file || busy}
              className="inline-flex items-center gap-1.5 px-4 h-9 rounded-pill bg-primary text-white text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {busy && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
              {busy ? t("common.processing") : t("vendorPortal.importSubmit")}
            </button>
          </div>
        </li>
      </ol>

      {file && (
        <p dir="auto" className="text-xs text-sand-600 truncate">
          {file.name}
        </p>
      )}

      {result && (
        <div className="space-y-2">
          {result.created > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 rounded-xl border border-green-200 bg-green-50 text-sm text-green-800">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 size={15} aria-hidden="true" />
                <span className="tabular-nums">{result.created}</span>{" "}
                {t("vendorPortal.importDone")}
              </span>
              <button
                type="button"
                onClick={() => router.push("/vendor")}
                className="font-medium underline underline-offset-2 hover:no-underline"
              >
                {t("vendorPortal.importOpenBoard")}
              </button>
            </div>
          )}

          {failed.length > 0 && (
            <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700 space-y-1.5">
              <p className="inline-flex items-center gap-2 font-medium">
                <TriangleAlert size={15} aria-hidden="true" />
                {nothingImported
                  ? t("vendorPortal.importFixFirst")
                  : `${failed.length} ${t("vendorPortal.importRejected")}`}
              </p>
              <ul className="space-y-0.5 ps-1">
                {failed.map((r) => (
                  <li key={r.row} dir="auto" className="text-xs">
                    {t("vendorPortal.importRow")} <span className="tabular-nums">{r.row}</span>
                    {": "}
                    {r.error ?? t("errors.somethingWrong")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-sand-500">{t("vendorPortal.importSingleInstead")}</p>
    </section>
  );
}
