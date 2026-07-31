"use client";
// Darb 2.0 PRD build — /fleet-portal: the fleet partner's driver roster.
//
// Revision 12 turned this from a read-only list into the front door of a
// request desk. Three things changed:
//
//   1. Two columns of work done (today, last 7 days). A supervisor's first
//      question about a driver used to need a phone call to Darb.
//   2. An Add driver button. It submits; it does not create anybody. The
//      driver has no Driver row until Darb approves, and until then they sit
//      at the top of this table greyed with "Pending Darb review" so the ask
//      is visibly somewhere rather than apparently nowhere.
//   3. Rows open a profile, which is where documents, leave and resignation
//      live.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert, UserPlus, Upload } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import { fleetApi, uploadFleetDocument } from "@/lib/darbApi";
import type { FleetDriverRow, FleetDocumentInput } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatNumber } from "@/i18n/format";

/** The documents Darb wants before it will activate a driver. */
const ONBOARD_DOCS = ["CIVIL_ID", "DRIVING_LICENSE", "VEHICLE_REG"] as const;

const inputClass =
  "w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";

/** "x/4" — how many of the four document statuses are VALID. */
function docsSummary(d: FleetDriverRow): string {
  const statuses = [d.civilIdStatus, d.drivingLicenseStatus, d.vehicleRegStatus, d.healthCertStatus];
  const valid = statuses.filter((s) => s === "VALID").length;
  return `${valid}/${statuses.length}`;
}

function isThrottled(d: FleetDriverRow): boolean {
  return !!d.throttledUntil && new Date(d.throttledUntil).getTime() > Date.now();
}

export default function FleetRosterPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("MOTORCYCLE");
  const [zone, setZone] = useState("");
  const [expiries, setExpiries] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File>>({});

  const meQuery = useQuery({
    queryKey: ["darb", "fleet", "me"],
    queryFn: () => fleetApi.me(),
  });
  const driversQuery = useQuery({
    queryKey: ["darb", "fleet", "drivers"],
    queryFn: () => fleetApi.drivers(),
  });
  const issuesQuery = useQuery({
    queryKey: ["darb", "fleet", "issues"],
    queryFn: () => fleetApi.issues(),
    refetchInterval: 120_000,
  });

  if (meQuery.isLoading || driversQuery.isLoading) {
    return <PageSkeleton statCards={0} tableRows={8} tableCols={9} />;
  }
  if (driversQuery.error) {
    return (
      <ErrorState
        error={
          driversQuery.error instanceof Error ? driversQuery.error.message : t("errors.loadingData")
        }
        onRetry={() => driversQuery.refetch()}
      />
    );
  }

  const fleet = meQuery.data;
  const drivers = driversQuery.data ?? [];
  const openIssues = issuesQuery.data?.openCount ?? 0;

  function resetForm() {
    setName(""); setPhone(""); setVehicleType("MOTORCYCLE"); setZone("");
    setExpiries({}); setFiles({});
  }

  async function submitDriver() {
    setSaving(true);
    try {
      // Upload first, then submit. If a file fails we stop before the request
      // exists, so the fleet never sees "submitted" for a driver whose civil
      // ID never arrived.
      const documents: FleetDocumentInput[] = [];
      for (const type of ONBOARD_DOCS) {
        const file = files[type];
        const expiry = expiries[type];
        if (!file && !expiry) continue;
        const doc = file
          ? await uploadFleetDocument(type, file)
          : { type };
        documents.push({ ...doc, expiryDate: expiry || null });
      }

      await fleetApi.submitDriver({
        name: name.trim(),
        phone: phone.trim(),
        vehicleType,
        zone: zone.trim() || null,
        documents,
      });
      toast.success(t("fleetPortal.driverSubmitted"));
      setAddOpen(false);
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "drivers"] });
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
            {t("fleetPortal.rosterTitle")}
          </h1>
          <p className="text-sm text-sand-600 mt-1" dir="auto">
            {fleet ? `${fleet.name}. ` : ""}
            {t("fleetPortal.rosterSubtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-primary text-white text-sm font-medium hover:opacity-90"
        >
          <UserPlus size={16} aria-hidden="true" />
          {t("fleetPortal.addDriver")}
        </button>
      </div>

      {fleet && fleet.disciplineStatus !== "OK" && (
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl border border-amber-200 bg-amber-50">
          <TriangleAlert size={17} className="text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {t("fleetPortal.disciplineBanner")}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              <StatusBadge status={fleet.disciplineStatus} />
            </p>
          </div>
        </div>
      )}

      {openIssues > 0 && (
        <button
          type="button"
          onClick={() => router.push("/fleet-portal/issues")}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-red-200 bg-red-50 text-start hover:bg-red-100/70"
        >
          <TriangleAlert size={17} className="text-red-600 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium text-red-800">
            {openIssues} {t("fleetPortal.navIssues")} · {t("fleetPortal.openIssues")}
          </span>
        </button>
      )}

      <DataTable
        columns={[
          {
            key: "name",
            label: t("fleetPortal.driverName"),
            render: (value: string, row: FleetDriverRow) => (
              <span dir="auto" className={row.pending ? "text-sand-500 italic" : undefined}>
                {value || "n/a"}
              </span>
            ),
          },
          {
            key: "phone",
            label: t("fleetPortal.phone"),
            render: (value: string) => (
              <span dir="ltr" className="tabular-nums">{value || "n/a"}</span>
            ),
          },
          { key: "vehicleType", label: t("fleetPortal.vehicle") },
          {
            key: "status",
            label: t("fleetPortal.status"),
            render: (value: string, row: FleetDriverRow) =>
              row.pending ? (
                <StatusBadge status="PENDING" label={t("fleetPortal.pendingReview")} />
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <StatusBadge status={value} />
                  {isThrottled(row) && (
                    <StatusBadge status="THROTTLED" label={t("fleetPortal.throttled")} />
                  )}
                </span>
              ),
          },
          {
            key: "ordersToday",
            label: t("fleetPortal.ordersToday"),
            render: (value: number, row: FleetDriverRow) =>
              row.pending ? (
                "n/a"
              ) : (
                <span dir="ltr" className="tabular-nums">
                  {formatNumber(value ?? 0, locale)}
                </span>
              ),
          },
          {
            key: "ordersLast7d",
            label: t("fleetPortal.orders7d"),
            render: (value: number, row: FleetDriverRow) =>
              row.pending ? (
                "n/a"
              ) : (
                <span dir="ltr" className="tabular-nums">
                  {formatNumber(value ?? 0, locale)}
                </span>
              ),
          },
          {
            key: "rating",
            label: t("fleetPortal.rating"),
            sortable: false,
            render: (value: FleetDriverRow["rating"]) =>
              value?.avg != null ? (
                <span dir="ltr" className="tabular-nums">
                  {formatNumber(value.avg, locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}{" "}
                  <span className="text-xs text-sand-500">({value.count})</span>
                </span>
              ) : (
                "n/a"
              ),
            exportValue: (value: FleetDriverRow["rating"]) =>
              value?.avg != null ? `${value.avg} (${value.count})` : "n/a",
          },
          {
            key: "docs",
            label: t("fleetPortal.docs"),
            sortable: false,
            render: (_value: unknown, row: FleetDriverRow) =>
              row.pending ? (
                "n/a"
              ) : (
                <span dir="ltr" className="tabular-nums">{docsSummary(row)}</span>
              ),
          },
        ]}
        data={drivers}
        // A pending driver has no profile to open: there is no Driver row yet.
        onRowClick={(row: FleetDriverRow) => {
          if (!row.pending) router.push(`/fleet-portal/drivers/${row.id}`);
        }}
        exportFilename="fleet-roster"
        emptyMessage={t("errors.noData")}
      />

      <SlidePanel
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t("fleetPortal.addDriverTitle")}
      >
        <div className="space-y-4">
          <p className="text-sm text-sand-600">{t("fleetPortal.addDriverHint")}</p>

          <label className="block">
            <span className="text-xs font-medium text-sand-700">{t("fleetPortal.driverName")}</span>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} dir="auto" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sand-700">{t("fleetPortal.phone")}</span>
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sand-700">{t("fleetPortal.vehicle")}</span>
            <select className={inputClass} value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
              <option value="MOTORCYCLE">MOTORCYCLE</option>
              <option value="CAR">CAR</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sand-700">{t("fleetPortal.zone")}</span>
            <input className={inputClass} value={zone} onChange={(e) => setZone(e.target.value)} dir="auto" />
          </label>

          <div className="pt-2 border-t border-sand-200 space-y-3">
            <p className="text-xs font-medium text-sand-700">{t("fleetPortal.driverDocuments")}</p>
            {ONBOARD_DOCS.map((type) => (
              <div key={type} className="space-y-1.5">
                <span className="text-xs text-sand-600">{type.replace(/_/g, " ")}</span>
                <div className="flex gap-2">
                  <input
                    type="date"
                    className={inputClass}
                    value={expiries[type] ?? ""}
                    onChange={(e) => setExpiries((p) => ({ ...p, [type]: e.target.value }))}
                  />
                  <label className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-sand-300 text-xs text-sand-700 cursor-pointer shrink-0 hover:bg-sand-100">
                    <Upload size={14} aria-hidden="true" />
                    {files[type] ? files[type].name.slice(0, 14) : t("fleetPortal.uploadFile")}
                    <input
                      type="file"
                      className="hidden"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setFiles((p) => ({ ...p, [type]: f }));
                      }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={saving || name.trim().length < 2 || phone.trim().length < 8}
            onClick={submitDriver}
            className="w-full h-10 rounded-full bg-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {t("fleetPortal.requestChange")}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}
