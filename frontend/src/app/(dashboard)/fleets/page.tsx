"use client";
import Link from "next/link";
// Darb 2.0 PRD build — /fleets: compact staff surface over the fleet
// governance APIs. A DataTable of fleet partners with a SlidePanel
// click-through showing the fleet's scorecard and payout statements.
// Reuses fleetPortal.* + cockpit.* keys (English-leaning composites are
// acceptable on this staff-only page).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Download, Plus } from "lucide-react";
import { downloadBlob } from "@/utils/downloadBlob";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";
import PeriodPicker, { type Period, presetRange } from "@/components/shared/PeriodPicker";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import { fleetsApi, unwrapList } from "@/lib/darbApi";
import type { FleetProfile, FleetStatementRow, FleetUser } from "@/types/darb";
import BackToSetup from "@/components/shared/BackToSetup";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate, formatKwd, formatNumber, formatPercent, localeTag } from "@/i18n/format";
import type { Locale } from "@/i18n/messages";

type FleetRow = FleetProfile & { _count?: { drivers?: number; users?: number } };

function pct(value: number | null | undefined, locale: Locale): string {
  return value == null ? "n/a" : formatPercent(value, locale, 1);
}

/** Slugged the same way the server names the file, so both agree. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "fleet";
}

/**
 * The workbook, optionally narrowed to one partner. `fleetId` is what the
 * panel passes: the scorecard and the payout history are only rendered there,
 * so without it the panel is the one screen whose data cannot leave the app.
 * `period` is passed through so the workbook covers the same window the panel
 * is showing rather than the server's 30-day default.
 */
async function exportWorkbook(fleetId?: string, nameForFile?: string, period?: Period) {
  const params = new URLSearchParams();
  if (fleetId) params.set("fleetId", fleetId);
  if (period) {
    params.set("from", period.from);
    params.set("to", period.to);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const stem = nameForFile ? slugify(nameForFile) : "fleets";
  await downloadBlob(
    `/api/fleets/export.xlsx${query}`,
    `${stem}-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

/**
 * Portal logins for one delivery company. Creating one used to be API-only
 * (`POST /api/fleets/:id/users`), so onboarding a partner meant a curl with an
 * admin token. The list sits above the form deliberately: without it the only
 * way to learn a login already exists is the 400 the create returns.
 *
 * ADMIN throughout, which is what both endpoints admit.
 */
function PortalLoginsSection({ fleet }: { fleet: FleetRow }) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });

  const usersQuery = useQuery({
    queryKey: ["darb", "fleets", fleet.id, "users"],
    queryFn: () => fleetsApi.users(fleet.id),
  });
  const users = unwrapList<FleetUser>(usersQuery.data);

  function reset() {
    setForm({ name: "", email: "", phone: "", password: "" });
    setError(null);
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) return;
    setSaving(true);
    setError(null);
    try {
      await fleetsApi.createUser(fleet.id, {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
      });
      toast.success(t("fleetPortal.portalLoginCreated"));
      reset();
      setOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["darb", "fleets", fleet.id, "users"],
      });
      // The list column shows _count.users, so it is stale now too.
      await queryClient.invalidateQueries({ queryKey: ["darb", "fleets"] });
    } catch (err: any) {
      // "Email already registered" is the failure an admin actually hits, and
      // it names its own fix. A generic toast would throw that away.
      setError(err?.response?.data?.error ?? t("toast.failedSave"));
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";
  const labelClass =
    "block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide";

  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide font-medium text-sand-600 mb-2">
        {t("fleetPortal.portalLoginsTitle")}
      </h3>

      {usersQuery.isLoading ? (
        <p className="text-sm text-sand-600">{t("common.loading")}</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-sand-600">{t("fleetPortal.noPortalLogins")}</p>
      ) : (
        <ul className="divide-y divide-sand-200">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-sand-900 truncate" dir="auto">{u.name}</p>
                <p className="text-xs text-sand-600 mt-0.5 font-mono truncate" dir="ltr">
                  {u.email}
                </p>
              </div>
              <StatusBadge status={u.isActive === false ? "INACTIVE" : "ACTIVE"} />
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex items-center gap-1.5 px-3 h-8 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors"
        >
          <Plus size={12} aria-hidden="true" />
          {t("fleetPortal.addPortalLogin")}
        </button>
      ) : (
        <form
          className="mt-3 space-y-3 border-t border-sand-200 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <p className="text-xs text-sand-600">{t("fleetPortal.portalLoginsHint")}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t("vendorsPage.userName")}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>{t("fleetPortal.phone")}</label>
              <input
                type="tel"
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={inputClass}
                placeholder={t("settingsPage.phonePlaceholder")}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>{t("vendorsPage.userEmail")}</label>
            <input
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>{t("vendorsPage.userPassword")}</label>
            <input
              type="password"
              dir="ltr"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={inputClass}
              minLength={8}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center px-3.5 h-9 rounded-pill bg-primary text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? t("common.processing") : t("fleetPortal.createPortalLogin")}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              className="inline-flex items-center px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * Revision 12 — the review queue.
 *
 * The fleet portal never writes a live record: everything a delivery company
 * wants arrives here as a request, and approving it is what creates the driver,
 * flips the status or marks the document valid. Sits at the TOP of the panel,
 * above the scorecard, because somebody on the other end is waiting on it.
 */
function RequestsSection({ fleet }: { fleet: FleetRow }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const requestsQuery = useQuery({
    queryKey: ["darb", "fleets", fleet.id, "requests"],
    queryFn: () => fleetsApi.requests(fleet.id, { status: "PENDING" }),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["darb", "fleets", fleet.id, "requests"] });
    await queryClient.invalidateQueries({ queryKey: ["darb", "fleets"] });
  };

  const fail = (err: unknown) =>
    toast.error(
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave"),
    );

  async function approve(reqId: string) {
    setBusy(reqId);
    try {
      await fleetsApi.approveRequest(fleet.id, reqId);
      toast.success(t("toast.saved"));
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function reject(reqId: string) {
    setBusy(reqId);
    try {
      await fleetsApi.rejectRequest(fleet.id, reqId, reason.trim());
      toast.success(t("toast.saved"));
      setRejecting(null);
      setReason("");
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function openDoc(docId: string) {
    try {
      const { url } = await fleetsApi.documentUrl(docId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error(t("errors.loadingData"));
    }
  }

  const requests = requestsQuery.data ?? [];
  if (requestsQuery.isLoading || requests.length === 0) return null;

  return (
    <section className="space-y-3 pb-5 mb-5 border-b border-sand-200">
      <h3 className="text-sm font-medium text-sand-900">
        {t("fleetPortal.requestsTitle")} ({requests.length})
      </h3>

      <ul className="space-y-3">
        {requests.map((r) => {
          const payload = (r.payload ?? {}) as Record<string, any>;
          return (
            <li key={r.id} className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <p className="text-sm font-medium text-sand-900" dir="auto">
                {r.type.replace(/_/g, " ")}
                {r.driver?.name ? ` · ${r.driver.name}` : payload.name ? ` · ${payload.name}` : ""}
              </p>
              <p className="text-xs text-sand-600 mt-0.5" dir="auto">
                {r.type === "DRIVER_ONBOARD"
                  ? `${payload.phone ?? ""} · ${payload.vehicleType ?? ""}`
                  : r.type === "DRIVER_STATUS"
                    ? `${payload.status ?? ""}${payload.reason ? ` · ${payload.reason}` : ""}`
                    : payload.documentType
                      ? String(payload.documentType).replace(/_/g, " ")
                      : ""}
              </p>
              <p className="text-xs text-sand-500 mt-0.5">
                {t("fleetPortal.submittedBy")}{" "}
                {r.requestedBy?.name ?? r.requestedBy?.email ?? "n/a"} ·{" "}
                {formatDate(r.createdAt, locale)}
              </p>

              {(r.documents ?? []).length > 0 && (
                <ul className="flex flex-wrap gap-2 mt-2">
                  {(r.documents ?? []).map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => d.fileKey && openDoc(d.id)}
                        disabled={!d.fileKey}
                        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-sand-300 bg-white text-xs text-sand-700 disabled:opacity-60 hover:bg-sand-100"
                      >
                        {d.type.replace(/_/g, " ")}
                        {d.expiryDate ? ` · ${formatDate(d.expiryDate, locale)}` : ""}
                        {!d.fileKey ? ` · ${t("fleetPortal.noFile")}` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {rejecting === r.id ? (
                <div className="mt-2.5 space-y-2">
                  <input
                    className="w-full px-3 h-9 rounded-xl bg-white border border-sand-300 text-sm"
                    placeholder={t("fleetPortal.darbNote")}
                    value={reason}
                    dir="auto"
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy === r.id || reason.trim().length < 5}
                      onClick={() => reject(r.id)}
                      className="h-9 px-3 rounded-full bg-red-600 text-white text-xs font-medium disabled:opacity-50"
                    >
                      {t("common.confirm")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRejecting(null); setReason(""); }}
                      className="h-9 px-3 rounded-full border border-sand-300 bg-white text-xs text-sand-700"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-2.5">
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => approve(r.id)}
                    className="h-9 px-3 rounded-full bg-primary text-white text-xs font-medium disabled:opacity-50"
                  >
                    {t("common.approve")}
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => { setRejecting(r.id); setReason(""); }}
                    className="h-9 px-3 rounded-full border border-sand-300 bg-white text-xs font-medium text-sand-700"
                  >
                    {t("common.reject")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ScorecardPanel({ fleet }: { fleet: FleetRow }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { isAdmin, hasRole } = useRole();
  const [downloading, setDownloading] = useState(false);
  // Revision 13 (#8). The endpoint is ACCOUNTANT+; showing the button to
  // anyone else would only produce a 403 they cannot act on.
  const canPay = hasRole("ACCOUNTANT");
  const [paying, setPaying] = useState<string | null>(null);

  /**
   * A scorecard with no stated period is not a report, it is a number nobody
   * can act on: 84.8% on-time over what? The panel now names its window and
   * lets it be changed, and everything below (the numbers and the download)
   * follows it. Month, not the old silent 30-day default, because that is the
   * window the payout statements are cut on.
   */
  const [period, setPeriod] = useState<Period>(() => presetRange("month"));

  async function downloadFleet() {
    setDownloading(true);
    try {
      await exportWorkbook(fleet.id, fleet.name, period);
    } catch {
      toast.error(t("toast.failedSave"));
    } finally {
      setDownloading(false);
    }
  }

  const scorecardQuery = useQuery({
    queryKey: ["darb", "fleets", fleet.id, "scorecard", period.from, period.to],
    queryFn: () => fleetsApi.scorecard(fleet.id, { from: period.from, to: period.to }),
  });
  const statementsQuery = useQuery({
    queryKey: ["darb", "fleets", fleet.id, "statements"],
    queryFn: () => fleetsApi.statements(fleet.id),
  });

  async function payStatement(statementId: string) {
    setPaying(statementId);
    try {
      await fleetsApi.payStatement(statementId);
      toast.success(t("fleetPortal.payoutPosted"));
      await statementsQuery.refetch();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          t("toast.failedSave"),
      );
    } finally {
      setPaying(null);
    }
  }

  const s = scorecardQuery.data;
  const statements = unwrapList<FleetStatementRow>(statementsQuery.data);
  const monthLabel = (iso: string) =>
    new Intl.DateTimeFormat(localeTag(locale), { year: "numeric", month: "long" }).format(
      new Date(iso)
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={fleet.disciplineStatus} />
        <span dir="ltr" className="text-sm text-sand-700 tabular-nums">
          {t("fleetPortal.feePerOrder")}: {formatKwd(fleet.flatFeePerOrderKwd, locale)}
        </span>
        {/* The way into the partner's own portal, read-only. ADMIN only,
            which is what the server admits (middleware/fleetScope). */}
        {isAdmin && (
          <Link
            href={`/fleet-portal?fleetPartnerId=${fleet.id}`}
            className="ms-auto inline-flex items-center gap-1.5 px-3 h-8 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors"
          >
            <Eye size={12} aria-hidden="true" />
            {t("vendorsPage.viewPortal")}
          </Link>
        )}
        <button
          type="button"
          onClick={() => void downloadFleet()}
          disabled={downloading}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 h-8 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors disabled:opacity-50",
            !isAdmin && "ms-auto"
          )}
        >
          <Download size={12} aria-hidden="true" />
          {downloading ? t("common.processing") : t("fleetPortal.exportThisCompany")}
        </button>
      </div>

      {/* Scorecard */}
      <section>
        <h3 className="text-xs uppercase tracking-wide font-medium text-sand-600 mb-2">
          {t("fleetPortal.scorecardTitle")}
        </h3>
        <div className="mb-3">
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
        {scorecardQuery.isLoading ? (
          <p className="text-sm text-sand-600">{t("common.loading")}</p>
        ) : !s ? (
          <p className="text-sm text-sand-600">{t("errors.noData")}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-sand-600">{t("fleetPortal.onTimeRate")}</dt>
            <dd dir="ltr" className="tabular-nums">{pct(s.onTimeRate, locale)}</dd>
            <dt className="text-sand-600">{t("fleetPortal.acceptanceRate")}</dt>
            <dd dir="ltr" className="tabular-nums">{pct(s.acceptanceRate, locale)}</dd>
            <dt className="text-sand-600">{t("fleetPortal.utilisation")}</dt>
            <dd dir="ltr" className="tabular-nums">{pct(s.utilisation, locale)}</dd>
            <dt className="text-sand-600">{t("fleetPortal.deliveredOrders")}</dt>
            <dd dir="ltr" className="tabular-nums">{formatNumber(s.deliveredOrders, locale)}</dd>
            <dt className="text-sand-600">{t("fleetPortal.onlineHours")}</dt>
            <dd dir="ltr" className="tabular-nums">
              {formatNumber(s.onlineHours, locale, { maximumFractionDigits: 1 })}
            </dd>
            <dt className="text-sand-600">{t("fleetPortal.contractedHours")}</dt>
            <dd dir="ltr" className="tabular-nums">
              {s.contractedHours != null
                ? formatNumber(s.contractedHours, locale, { maximumFractionDigits: 1 })
                : "n/a"}
            </dd>
            <dt className="text-sand-600">{t("fleetPortal.rating")}</dt>
            <dd dir="ltr" className="tabular-nums">
              {s.avgRating != null
                ? `${formatNumber(s.avgRating, locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} (${s.ratingCount})`
                : "n/a"}
            </dd>
          </dl>
        )}
      </section>

      {/* Statements */}
      <section>
        <h3 className="text-xs uppercase tracking-wide font-medium text-sand-600 mb-2">
          {t("fleetPortal.payoutsTitle")}
        </h3>
        {statementsQuery.isLoading ? (
          <p className="text-sm text-sand-600">{t("common.loading")}</p>
        ) : statements.length === 0 ? (
          <p className="text-sm text-sand-600">{t("fleetPortal.noStatements")}</p>
        ) : (
          <ul className="divide-y divide-sand-200">
            {statements.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm text-sand-900" dir="ltr">{monthLabel(row.periodStart)}</p>
                  <p className="text-xs text-sand-600 mt-0.5" dir="ltr">
                    {formatNumber(row.deliveredOrders, locale)} x{" "}
                    {formatKwd(row.feePerOrderKwd, locale)}
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span dir="ltr" className="text-sm text-sand-900 tabular-nums font-medium">
                    {formatKwd(row.totalKwd, locale)}
                  </span>
                  <StatusBadge status={row.status} />
                  {/* Revision 13 (#8). The delivery company confirms before
                      Darb processes it, so the button says why it cannot be
                      pressed rather than answering 400 after the click. The
                      server refuses an unconfirmed statement either way. */}
                  {canPay && row.status !== "PAID" && (
                    <button
                      type="button"
                      disabled={row.status !== "CONFIRMED" || paying === row.id}
                      title={
                        row.status === "CONFIRMED"
                          ? undefined
                          : t("fleetPortal.payBlockedUnconfirmed")
                      }
                      onClick={() => void payStatement(row.id)}
                      className="h-8 px-3 rounded-pill bg-primary text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t("fleetPortal.payNow")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Portal logins — ADMIN only, matching both endpoints behind it. */}
      {isAdmin && <PortalLoginsSection fleet={fleet} />}
    </div>
  );
}

export default function FleetsPage() {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState<FleetRow | null>(null);
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();

  /**
   * Revision 4 (#10). The client asked for the detail to be in the download.
   * The old client-side CSV could only ever carry the five list columns —
   * the scorecard and the payout history are separate queries the table never
   * makes. So the workbook is built server-side and streamed: three sheets,
   * with rates as real percentages and money as real numbers so Excel sorts
   * and sums them instead of treating them as text.
   */
  async function downloadWorkbook() {
    setDownloading(true);
    try {
      await exportWorkbook();
    } catch {
      toast.error(t("toast.failedSave"));
    } finally {
      setDownloading(false);
    }
  }

  const fleetsQuery = useQuery({
    queryKey: ["darb", "fleets"],
    queryFn: () => fleetsApi.list({ limit: 100 }),
  });

  if (fleetsQuery.isLoading) return <PageSkeleton statCards={0} tableRows={6} tableCols={5} />;
  if (fleetsQuery.error) {
    return (
      <ErrorState
        error={
          fleetsQuery.error instanceof Error ? fleetsQuery.error.message : t("errors.loadingData")
        }
        onRetry={() => fleetsQuery.refetch()}
      />
    );
  }

  const fleets = unwrapList<FleetRow>(fleetsQuery.data);

  return (
    <div className="space-y-6">
      <BackToSetup />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-sm text-sand-900">
            {t("simple.setupCompanies")}
          </h1>
          <p className="text-sm text-sand-600 mt-1">{t("simple.setupCompaniesDesc")}</p>
        </div>
        <button
          type="button"
          onClick={() => void downloadWorkbook()}
          disabled={downloading || fleets.length === 0}
          className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors disabled:opacity-50"
        >
          <Download size={12} aria-hidden="true" />
          {downloading ? t("common.processing") : t("fleetPortal.exportExcel")}
        </button>
      </div>

      <DataTable
        columns={[
          {
            key: "name",
            label: t("cockpit.fleetName"),
            render: (value: string) => <span dir="auto">{value}</span>,
          },
          {
            key: "_count",
            label: t("fleetPortal.navRoster"),
            sortable: false,
            render: (value: FleetRow["_count"]) =>
              value?.drivers != null ? formatNumber(value.drivers, locale) : "n/a",
            exportValue: (value: FleetRow["_count"]) =>
              value?.drivers != null ? value.drivers : "n/a",
          },
          {
            key: "disciplineStatus",
            label: t("cockpit.fleetDiscipline"),
            render: (value: string) => <StatusBadge status={value} />,
          },
          {
            key: "flatFeePerOrderKwd",
            label: t("fleetPortal.feePerOrder"),
            render: (value: string) => (
              <span dir="ltr" className="tabular-nums">{formatKwd(value, locale)}</span>
            ),
          },
          {
            key: "isActive",
            label: t("fleetPortal.status"),
            render: (value: boolean) => (
              <StatusBadge status={value ? "ACTIVE" : "INACTIVE"} />
            ),
          },
        ]}
        data={fleets}
        onRowClick={(row: FleetRow) => setSelected(row)}
        emptyMessage={t("errors.noData")}
      />

      <SlidePanel
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        subtitle={t("cockpit.fleetName")}
      >
        {selected && (
          <>
            <RequestsSection fleet={selected} />
            <ScorecardPanel fleet={selected} />
          </>
        )}
      </SlidePanel>
    </div>
  );
}
