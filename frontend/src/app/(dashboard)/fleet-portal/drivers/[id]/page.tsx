"use client";
// Darb 2.0 revision 12 — /fleet-portal/drivers/[id]: one driver, everything a
// supervisor needs about them in one screen.
//
// Four jobs on this page:
//   1. Day-by-day orders for a month. The question the roster's two columns
//      make people ask next.
//   2. Documents, with renewals. A renewal is a request; Darb approves it and
//      only then does the status read valid again, so a delivery company
//      cannot type its own expiry date to clear a block.
//   3. Leave and resignation. Both are requests.
//   4. The phone number, which is the ONE thing that writes straight through.
//      The client asked for that exception because drivers change SIMs
//      constantly. The hint under the field says what it costs: the driver
//      signs into the app with this number.
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ExternalLink, Phone, TriangleAlert, UserMinus, CalendarOff, RotateCcw,
} from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import DocumentFileField from "@/components/fleet/DocumentFileField";
import { fleetApi, uploadFleetDocument } from "@/lib/darbApi";
import type { FleetDocument } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate, formatNumber } from "@/i18n/format";

const DRIVER_DOC_TYPES = [
  "CIVIL_ID", "DRIVING_LICENSE", "VEHICLE_REG", "VEHICLE_INSURANCE",
  "HEALTH_CERT", "WORK_PERMIT", "FOOD_HANDLING",
  // Revision 16 (#3). Kept in step with DRIVER_DOC_COLUMNS on the server: a
  // type the panel cannot offer is a type nobody can ever upload.
  "POLICE_CLEARANCE", "PASSPORT", "DRIVER_SELFIE",
] as const;

const inputClass =
  "w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";

/** The current month as YYYY-MM. */
function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function FleetDriverProfilePage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const driverId = String(params?.id ?? "");

  const [month, setMonth] = useState(thisMonth());
  const [docOpen, setDocOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState<null | "LEAVE" | "TERMINATED" | "ACTIVE">(null);
  const [saving, setSaving] = useState(false);

  const [docType, setDocType] = useState<string>("CIVIL_ID");
  const [docExpiry, setDocExpiry] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [newPhone, setNewPhone] = useState("");
  const [reason, setReason] = useState("");
  // Revision 13 (#4, #5). A leave request with no dates and a resignation with
  // no last day are both a phone call Darb has to make anyway, which is the
  // work this screen exists to remove.
  const [leaveStart, setLeaveStart] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [lastWorkingDate, setLastWorkingDate] = useState("");

  const profileQuery = useQuery({
    queryKey: ["darb", "fleet", "driver", driverId, month],
    queryFn: () => fleetApi.driver(driverId, { month }),
    enabled: !!driverId,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "driver", driverId] });

  const fail = (err: unknown) => {
    const e = err as { response?: { data?: { error?: string } }; message?: string };
    toast.error(e?.response?.data?.error ?? e?.message ?? t("toast.failedSave"));
  };

  if (profileQuery.isLoading) return <PageSkeleton statCards={3} tableRows={8} tableCols={2} />;
  if (profileQuery.error || !profileQuery.data) {
    return (
      <ErrorState
        error={
          profileQuery.error instanceof Error
            ? profileQuery.error.message
            : t("errors.loadingData")
        }
        onRetry={() => profileQuery.refetch()}
      />
    );
  }

  const { driver, rating, documents, issues, activity, storageConfigured } = profileQuery.data;

  async function openFile(id: string) {
    try {
      const { url } = await fleetApi.documentUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error(t("errors.loadingData"));
    }
  }

  async function submitDocument() {
    setSaving(true);
    try {
      const base = docFile ? await uploadFleetDocument(docType, docFile) : { type: docType };
      await fleetApi.requestDriverDocument(driverId, { ...base, expiryDate: docExpiry || null });
      toast.success(t("fleetPortal.documentSubmitted"));
      setDocOpen(false);
      setDocFile(null);
      setDocExpiry("");
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function submitStatus() {
    if (!statusOpen) return;
    setSaving(true);
    try {
      await fleetApi.requestDriverStatus(driverId, {
        status: statusOpen,
        reason: reason.trim() || undefined,
        // Sent only for the status that requires them. The endpoint validates
        // the same rule, so a stale tab cannot post a leave with no end.
        ...(statusOpen === "LEAVE"
          ? { leaveStartDate: leaveStart, returnDate }
          : {}),
        ...(statusOpen === "TERMINATED" ? { lastWorkingDate } : {}),
      });
      toast.success(t("fleetPortal.statusRequested"));
      setStatusOpen(null);
      setReason("");
      setLeaveStart("");
      setReturnDate("");
      setLastWorkingDate("");
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function submitPhone() {
    setSaving(true);
    try {
      await fleetApi.updatePhone(driverId, newPhone.trim());
      toast.success(t("fleetPortal.phoneUpdated"));
      setPhoneOpen(false);
      setNewPhone("");
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => router.push("/fleet-portal")}
        className="inline-flex items-center gap-1.5 text-sm text-sand-600 hover:text-sand-900"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        {t("fleetPortal.backToRoster")}
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-sm text-sand-900" dir="auto">
            {driver.name}
          </h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-sm text-sand-600">
            <StatusBadge status={driver.status} />
            <span dir="ltr" className="tabular-nums">{driver.phone}</span>
            {driver.driverCode && (
              <span className="text-xs text-sand-500">
                {t("fleetPortal.driverCode")} {driver.driverCode}
              </span>
            )}
            <span className="text-xs text-sand-500">{driver.vehicleType}</span>
            {rating.avg != null && (
              <span className="text-xs text-sand-500" dir="ltr">
                {formatNumber(rating.avg, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ({rating.count})
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => { setNewPhone(driver.phone); setPhoneOpen(true); }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-sand-300 bg-white text-xs font-medium text-sand-700 hover:bg-sand-100"
          >
            <Phone size={13} aria-hidden="true" />
            {t("fleetPortal.changePhone")}
          </button>
          {driver.status === "LEAVE" ? (
            <button
              type="button"
              onClick={() => setStatusOpen("ACTIVE")}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-sand-300 bg-white text-xs font-medium text-sand-700 hover:bg-sand-100"
            >
              <RotateCcw size={13} aria-hidden="true" />
              {t("fleetPortal.markBackActive")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStatusOpen("LEAVE")}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-sand-300 bg-white text-xs font-medium text-sand-700 hover:bg-sand-100"
            >
              <CalendarOff size={13} aria-hidden="true" />
              {t("fleetPortal.markOnLeave")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setStatusOpen("TERMINATED")}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-red-200 bg-white text-xs font-medium text-red-700 hover:bg-red-50"
          >
            <UserMinus size={13} aria-hidden="true" />
            {t("fleetPortal.markResigned")}
          </button>
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="space-y-2">
          {issues.map((issue) => (
            <li
              key={issue.id}
              className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50"
            >
              <TriangleAlert size={16} className="text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-amber-900" dir="auto">{issue.title}</p>
                <p className="text-xs text-amber-800 mt-0.5" dir="auto">{issue.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Activity */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="font-display text-lg text-sand-900">{t("fleetPortal.activityTitle")}</h2>
          <input
            type="month"
            className="h-9 px-3 rounded-xl bg-white border border-sand-300 text-sm"
            value={month}
            onChange={(e) => setMonth(e.target.value || thisMonth())}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-sand-200 bg-white px-4 py-3">
            <p className="text-xs text-sand-500">{t("fleetPortal.monthTotal")}</p>
            <p className="text-xl font-display text-sand-900 tabular-nums" dir="ltr">
              {formatNumber(activity.totalOrders, locale)}
            </p>
          </div>
          <div className="rounded-xl border border-sand-200 bg-white px-4 py-3">
            <p className="text-xs text-sand-500">{t("fleetPortal.activeDays")}</p>
            <p className="text-xl font-display text-sand-900 tabular-nums" dir="ltr">
              {formatNumber(activity.activeDays, locale)}
            </p>
          </div>
          <div className="rounded-xl border border-sand-200 bg-white px-4 py-3">
            <p className="text-xs text-sand-500">{t("fleetPortal.avgPerDay")}</p>
            <p className="text-xl font-display text-sand-900 tabular-nums" dir="ltr">
              {activity.avgPerActiveDay != null
                ? formatNumber(activity.avgPerActiveDay, locale, { maximumFractionDigits: 1 })
                : "n/a"}
            </p>
          </div>
        </div>

        {activity.days.length === 0 ? (
          <p className="px-4 py-6 rounded-xl border border-sand-200 bg-white text-sm text-sand-600">
            {t("fleetPortal.noActivity")}
          </p>
        ) : (
          <DataTable
            columns={[
              {
                key: "date",
                label: t("fleetPortal.period"),
                render: (value: string) => formatDate(value, locale),
              },
              {
                key: "orders",
                label: t("fleetPortal.orders"),
                render: (value: number) => (
                  <span dir="ltr" className="tabular-nums">{formatNumber(value, locale)}</span>
                ),
              },
            ]}
            data={activity.days}
            exportFilename={`driver-activity-${month}`}
            emptyMessage={t("fleetPortal.noActivity")}
          />
        )}
      </section>

      {/* Documents */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="font-display text-lg text-sand-900">
            {t("fleetPortal.driverDocuments")}
          </h2>
          <button
            type="button"
            onClick={() => setDocOpen(true)}
            className="h-9 px-3 rounded-full bg-primary text-white text-xs font-medium hover:opacity-90"
          >
            {t("fleetPortal.addDocument")}
          </button>
        </div>

        {!storageConfigured && (
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
          exportFilename="driver-documents"
          emptyMessage={t("errors.noData")}
        />
      </section>

      <SlidePanel open={docOpen} onClose={() => setDocOpen(false)} title={t("fleetPortal.addDocument")}>
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-sand-700">{t("fleetPortal.documentType")}</span>
            <select className={inputClass} value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DRIVER_DOC_TYPES.map((tp) => (
                <option key={tp} value={tp}>{tp.replace(/_/g, " ")}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sand-700">{t("fleetPortal.expiryDate")}</span>
            <input
              type="date"
              className={inputClass}
              value={docExpiry}
              onChange={(e) => setDocExpiry(e.target.value)}
            />
          </label>
          {/* Revision 13 (#2). The import button the client asked for, always
              on the panel: it used to disappear entirely when Darb had not
              switched storage on, which is what "there must be an import
              button" was reporting. */}
          <DocumentFileField
            file={docFile}
            onChange={setDocFile}
            storageConfigured={storageConfigured}
          />
          <button
            type="button"
            disabled={saving || (!docFile && !docExpiry)}
            onClick={submitDocument}
            className="w-full h-10 rounded-full bg-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {t("fleetPortal.requestChange")}
          </button>
        </div>
      </SlidePanel>

      <SlidePanel
        open={!!statusOpen}
        onClose={() => setStatusOpen(null)}
        title={
          statusOpen === "TERMINATED"
            ? t("fleetPortal.markResigned")
            : statusOpen === "ACTIVE"
              ? t("fleetPortal.markBackActive")
              : t("fleetPortal.markOnLeave")
        }
        subtitle={driver.name}
      >
        <div className="space-y-4">
          {/* Revision 13 (#4). Both ends of the leave: "he is off" without a
              return date is something Darb cannot plan a zone around. */}
          {statusOpen === "LEAVE" && (
            <>
              <label className="block">
                <span className="text-xs font-medium text-sand-700">
                  {t("fleetPortal.leaveStartDate")} *
                </span>
                <input
                  type="date"
                  className={inputClass}
                  value={leaveStart}
                  onChange={(e) => setLeaveStart(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-sand-700">
                  {t("fleetPortal.returnDate")} *
                </span>
                <input
                  type="date"
                  className={inputClass}
                  min={leaveStart || undefined}
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
              </label>
              {leaveStart && returnDate && returnDate < leaveStart && (
                <p className="text-xs text-red-600">{t("fleetPortal.returnBeforeLeave")}</p>
              )}
            </>
          )}

          {/* Revision 13 (#5). The last working day is the day the driver stops
              counting towards the payout, so it is not optional. */}
          {statusOpen === "TERMINATED" && (
            <label className="block">
              <span className="text-xs font-medium text-sand-700">
                {t("fleetPortal.lastWorkingDate")} *
              </span>
              <input
                type="date"
                className={inputClass}
                value={lastWorkingDate}
                onChange={(e) => setLastWorkingDate(e.target.value)}
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs font-medium text-sand-700">{t("fleetPortal.reasonOptional")}</span>
            <textarea
              rows={4}
              dir="auto"
              className="w-full px-3 py-2 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={
              saving ||
              (statusOpen === "LEAVE" &&
                (!leaveStart || !returnDate || returnDate < leaveStart)) ||
              (statusOpen === "TERMINATED" && !lastWorkingDate)
            }
            onClick={submitStatus}
            className="w-full h-10 rounded-full bg-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {t("fleetPortal.requestChange")}
          </button>
        </div>
      </SlidePanel>

      <SlidePanel open={phoneOpen} onClose={() => setPhoneOpen(false)} title={t("fleetPortal.changePhone")}>
        <div className="space-y-4">
          <p className="text-sm text-sand-600">{t("fleetPortal.phoneDirectHint")}</p>
          <label className="block">
            <span className="text-xs font-medium text-sand-700">{t("fleetPortal.phone")}</span>
            <input
              className={inputClass}
              dir="ltr"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={saving || newPhone.trim().length < 8}
            onClick={submitPhone}
            className="w-full h-10 rounded-full bg-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {t("fleetPortal.changePhone")}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}
