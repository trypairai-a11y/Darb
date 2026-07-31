"use client";
// Darb 2.0 revision 12 — /fleet-portal/documents: the delivery company's own
// paperwork, plus the log of everything it has asked Darb for.
//
// Uploads go straight to private storage from the browser; the API only signs
// the PUT. When storage is not configured the page says so in a sentence and
// still accepts an expiry date, rather than showing a file picker that dies.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, ExternalLink } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import DocumentFileField from "@/components/fleet/DocumentFileField";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import { fleetApi, uploadFleetDocument } from "@/lib/darbApi";
import type { FleetChangeRequest, FleetDocument } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate } from "@/i18n/format";

const inputClass =
  "w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function FleetDocumentsPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState("TRADE_LICENSE");
  const [expiry, setExpiry] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const docsQuery = useQuery({
    queryKey: ["darb", "fleet", "documents"],
    queryFn: () => fleetApi.documents(),
  });
  const requestsQuery = useQuery({
    queryKey: ["darb", "fleet", "requests"],
    queryFn: () => fleetApi.requests(),
  });

  if (docsQuery.isLoading) return <PageSkeleton statCards={0} tableRows={5} tableCols={4} />;
  if (docsQuery.error) {
    return (
      <ErrorState
        error={
          docsQuery.error instanceof Error ? docsQuery.error.message : t("errors.loadingData")
        }
        onRetry={() => docsQuery.refetch()}
      />
    );
  }

  const payload = docsQuery.data;
  const documents = payload?.documents ?? [];
  const storageOn = payload?.storageConfigured ?? false;
  const requests = requestsQuery.data ?? [];

  async function openFile(id: string) {
    try {
      const { url } = await fleetApi.documentUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error(t("errors.loadingData"));
    }
  }

  async function submit() {
    setSaving(true);
    try {
      const base = file ? await uploadFleetDocument(type, file) : { type };
      await fleetApi.addCompanyDocument({ ...base, expiryDate: expiry || null });
      toast.success(t("fleetPortal.documentSubmitted"));
      setOpen(false);
      setFile(null);
      setExpiry("");
      await queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "documents"] });
      await queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "requests"] });
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(e?.response?.data?.error ?? e?.message ?? t("toast.failedSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-sm text-sand-900">
            {t("fleetPortal.documentsTitle")}
          </h1>
          <p className="text-sm text-sand-600 mt-1">{t("fleetPortal.documentsSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-primary text-white text-sm font-medium hover:opacity-90"
        >
          <FilePlus2 size={16} aria-hidden="true" />
          {t("fleetPortal.addDocument")}
        </button>
      </div>

      {!storageOn && (
        <p className="px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
          {t("fleetPortal.storageOff")}
        </p>
      )}

      <DataTable
        columns={[
          {
            key: "type",
            label: t("fleetPortal.documentType"),
            render: (value: string) => value.replace(/_/g, " "),
          },
          {
            key: "expiryDate",
            label: t("fleetPortal.expiryDate"),
            render: (value: string | null) => (value ? formatDate(value, locale) : "n/a"),
          },
          {
            key: "status",
            label: t("fleetPortal.status"),
            render: (value: string, row: FleetDocument) => (
              <span className="inline-flex items-center gap-2">
                <StatusBadge status={value} />
                {row.rejectionReason && (
                  <span className="text-xs text-red-600" dir="auto">{row.rejectionReason}</span>
                )}
              </span>
            ),
          },
          {
            key: "fileName",
            label: t("fleetPortal.viewFile"),
            sortable: false,
            render: (value: string | null, row: FleetDocument) =>
              row.fileKey ? (
                <button
                  type="button"
                  onClick={() => openFile(row.id)}
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <ExternalLink size={13} aria-hidden="true" />
                  <span dir="auto">{value ?? t("fleetPortal.viewFile")}</span>
                </button>
              ) : (
                <span className="text-sm text-sand-500">{t("fleetPortal.noFile")}</span>
              ),
          },
        ]}
        data={documents}
        exportFilename="fleet-documents"
        emptyMessage={t("errors.noData")}
      />

      <div>
        <h2 className="font-display text-lg text-sand-900 mb-3">
          {t("fleetPortal.requestsTitle")}
        </h2>
        <DataTable
          columns={[
            {
              key: "type",
              label: t("fleetPortal.documentType"),
              render: (value: string, row: FleetChangeRequest) => (
                <span dir="auto">
                  {value.replace(/_/g, " ")}
                  {row.driver?.name ? ` · ${row.driver.name}` : ""}
                </span>
              ),
            },
            {
              key: "createdAt",
              label: t("fleetPortal.submittedOn"),
              render: (value: string) => formatDate(value, locale),
            },
            {
              key: "status",
              label: t("fleetPortal.requestStatus"),
              render: (value: string) => <StatusBadge status={value} />,
            },
            {
              key: "reviewNote",
              label: t("fleetPortal.darbNote"),
              sortable: false,
              render: (value: string | null) => (
                <span dir="auto">{value || "n/a"}</span>
              ),
            },
          ]}
          data={requests}
          exportFilename="fleet-requests"
          emptyMessage={t("fleetPortal.noRequests")}
        />
      </div>

      <SlidePanel open={open} onClose={() => setOpen(false)} title={t("fleetPortal.addDocument")}>
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-sand-700">
              {t("fleetPortal.documentType")}
            </span>
            <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
              {(payload?.requiredTypes ?? []).map((tp) => (
                <option key={tp} value={tp}>{tp.replace(/_/g, " ")}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sand-700">
              {t("fleetPortal.expiryDate")}
            </span>
            <input
              type="date"
              className={inputClass}
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </label>

          {/* Revision 13 (#2). Always here, disabled with a reason when Darb
              has not switched storage on, rather than absent. */}
          <DocumentFileField
            file={file}
            onChange={setFile}
            storageConfigured={storageOn}
          />

          <button
            type="button"
            disabled={saving || (!file && !expiry)}
            onClick={submit}
            className="w-full h-10 rounded-full bg-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {t("fleetPortal.addDocument")}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}
