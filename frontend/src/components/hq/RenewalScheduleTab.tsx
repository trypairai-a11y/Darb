"use client";
// Revision 20 — Compliance › Renewal schedule.
//
// "the system will give a list of documents that will expire or already
// expired, and should be able to give the compliance team the ability to
// freeze accounts when the documents expire".
//
// Worst first: what has already lapsed, then what lapses soonest. That order is
// the feature. A renewal schedule sorted by name is a list somebody scrolls
// once and never again.
//
// Driver rows are built from the Driver.<doc>Expiry columns rather than from
// the document table, because those columns are the read model and a driver
// whose civil ID was recorded before the portal existed has an expiry with no
// document row behind it. A schedule that cannot see them misses the oldest
// drivers on the network, who are exactly the ones whose paper lapses.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Snowflake, Sun } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import StatCard from "@/components/shared/StatCard";
import { useToast } from "@/components/shared/Toast";
import { complianceApi } from "@/lib/darbApi";
import type { DocScope, FreezeTarget, RenewalRow } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate } from "@/i18n/format";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

const HORIZONS = [7, 30, 90];

function humanType(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** A renewal row's scope mapped to the freeze target that owns the account. */
function freezeTargetFor(row: RenewalRow): FreezeTarget {
  return row.scope === "DRIVER" ? "DRIVER" : row.scope === "COMPANY" ? "FLEET" : "VENDOR";
}

export default function RenewalScheduleTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useRole();
  const canFreeze = hasRole("SUPERVISOR");

  const [withinDays, setWithinDays] = useState(30);
  const [scope, setScope] = useState<DocScope | "">("");
  const [freezing, setFreezing] = useState<RenewalRow | null>(null);
  const [reason, setReason] = useState("");

  const query = useQuery({
    queryKey: ["darb", "compliance", "renewals", withinDays, scope],
    queryFn: () =>
      complianceApi.renewals({ withinDays, ...(scope ? { scope } : {}), includeExpired: true }),
  });

  const freezeMutation = useMutation({
    mutationFn: ({ row, frozen }: { row: RenewalRow; frozen: boolean }) =>
      complianceApi.freeze({
        target: freezeTargetFor(row),
        id: row.ownerId,
        frozen,
        ...(frozen ? { reason: reason.trim() } : {}),
      }),
    onSuccess: (_data, variables) => {
      toast.success(t(variables.frozen ? "compliance.froze" : "compliance.unfroze"));
      setFreezing(null);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["darb", "compliance"] });
      void queryClient.invalidateQueries({ queryKey: ["darb", "driver-tracking"] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message ?? t("errors.savingData"));
    },
  });

  if (query.isLoading) return <PageSkeleton statCards={3} tableRows={8} tableCols={6} />;
  if (query.error) {
    return (
      <ErrorState
        error={query.error instanceof Error ? query.error.message : t("errors.loadingData")}
        onRetry={() => query.refetch()}
      />
    );
  }

  const rows = query.data?.rows ?? [];
  const counts = query.data?.counts ?? { expired: 0, expiring: 0, frozen: 0 };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title={t("compliance.healthEXPIRED")}
          value={String(counts.expired)}
          icon={Snowflake}
          highlight={counts.expired > 0}
        />
        <StatCard title={t("compliance.healthEXPIRING")} value={String(counts.expiring)} icon={Sun} />
        <StatCard title={t("compliance.frozen")} value={String(counts.frozen)} icon={Snowflake} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-sand-600">{t("compliance.horizon")}</span>
        <div className="flex gap-1 bg-sand-100 rounded-pill p-1">
          {HORIZONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setWithinDays(d)}
              className={cn(
                "px-3 h-7 text-xs font-medium rounded-pill transition-colors",
                withinDays === d ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900",
              )}
            >
              {t("driverTracking.windowDays").replace("{days}", String(d))}
            </button>
          ))}
        </div>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as DocScope | "")}
          className="h-9 px-3 rounded-pill border border-sand-200 bg-card text-sm"
        >
          <option value="">{t("labels.all")}</option>
          <option value="DRIVER">{t("compliance.scopeDRIVER")}</option>
          <option value="COMPANY">{t("compliance.scopeCOMPANY")}</option>
          <option value="VENDOR">{t("compliance.scopeVENDOR")}</option>
        </select>
      </div>

      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-sand-50 text-sand-600">
              <tr>
                <th className="text-start font-medium px-4 py-3">{t("compliance.owner")}</th>
                <th className="text-start font-medium px-4 py-3">{t("compliance.type")}</th>
                <th className="text-start font-medium px-4 py-3">{t("compliance.expiry")}</th>
                <th className="text-start font-medium px-4 py-3">{t("driverTracking.state")}</th>
                <th className="text-start font-medium px-4 py-3">{t("driverTracking.company")}</th>
                {canFreeze && (
                  <th className="text-end font-medium px-4 py-3">{t("driverTracking.actions")}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canFreeze ? 6 : 5} className="px-4 py-10 text-center text-sand-500">
                    {t("compliance.empty")}
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <tr key={`${row.scope}-${row.ownerId}-${row.type}-${i}`} className="hover:bg-sand-50/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-sand-900">{row.ownerName}</p>
                    <p className="text-xs text-sand-500">
                      {t(`compliance.scope${row.scope}`)}
                      {row.ownerRef ? ` · ${row.ownerRef}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-sand-700">{humanType(row.type)}</td>
                  <td className="px-4 py-3">
                    <p className="text-sand-900">
                      {row.expiryDate ? formatDate(row.expiryDate, locale) : "n/a"}
                    </p>
                    <p
                      className={cn(
                        "text-xs",
                        row.health === "EXPIRED" ? "text-red-600 font-medium" : "text-amber-600",
                      )}
                    >
                      {row.daysLeft === null
                        ? "n/a"
                        : row.daysLeft < 0
                          ? t("compliance.daysOverdue").replace("{n}", String(Math.abs(row.daysLeft)))
                          : t("compliance.daysLeft").replace("{n}", String(row.daysLeft))}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "px-2 h-6 inline-flex items-center rounded-pill text-[11px] font-medium",
                        row.frozen
                          ? "bg-sky-100 text-sky-700"
                          : row.health === "EXPIRED"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700",
                      )}
                    >
                      {row.frozen ? t("compliance.frozen") : t(`compliance.health${row.health}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sand-600">{row.fleetPartnerName ?? "n/a"}</td>
                  {canFreeze && (
                    <td className="px-4 py-3 text-end">
                      {row.frozen ? (
                        <button
                          type="button"
                          onClick={() => freezeMutation.mutate({ row, frozen: false })}
                          className="h-8 px-4 rounded-pill border border-sand-200 text-sand-700 text-xs font-medium"
                        >
                          {t("compliance.unfreeze")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setFreezing(row);
                            // Prefill the reason: it is nearly always the same
                            // sentence, and a required field somebody has to
                            // retype forty times is a required field that gets
                            // filled with a full stop.
                            setReason(
                              `${humanType(row.type)} ${
                                row.health === "EXPIRED" ? "has expired" : "expires"
                              }${row.expiryDate ? ` on ${formatDate(row.expiryDate, "en")}` : ""}.`,
                            );
                          }}
                          className="h-8 px-4 inline-flex items-center gap-1.5 rounded-pill bg-sky-600 text-white text-xs font-medium"
                        >
                          <Snowflake size={13} aria-hidden="true" />
                          {t("compliance.freeze")}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SlidePanel
        open={freezing !== null}
        onClose={() => setFreezing(null)}
        title={t("compliance.freeze")}
        subtitle={freezing?.ownerName}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-sand-900 mb-1">
              {t("compliance.freezeReason")}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-sand-200 bg-card p-3 text-sm"
            />
            <p className="text-xs text-sand-500 mt-1">
              {t(
                freezing?.scope === "DRIVER"
                  ? "compliance.freezeHintDriver"
                  : "compliance.freezeHintPartner",
              )}
            </p>
          </div>
          <button
            type="button"
            disabled={!reason.trim() || freezeMutation.isPending}
            onClick={() => freezing && freezeMutation.mutate({ row: freezing, frozen: true })}
            className="h-10 px-5 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
          >
            {t("compliance.freeze")}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}
