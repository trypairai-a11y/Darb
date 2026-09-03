"use client";
// Client note (2026-08-31): a delivery company opens as a full page now — the
// same layout as the vendor profile — instead of the old SlidePanel, and the
// company's drivers are a tab of their own. The sections themselves moved here
// from /fleets (panel) unchanged; only the frame around them is new.
import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, FileText, Plus } from "lucide-react";
import { downloadBlob } from "@/utils/downloadBlob";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";
import PeriodPicker, { type Period, presetRange } from "@/components/shared/PeriodPicker";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import { fleetsApi, unwrapList } from "@/lib/darbApi";
import type { FleetDocument, FleetProfile, FleetStatementRow, FleetUser } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { DirectionalIcon } from "@/i18n/directionalIcon";
import { formatDate, formatKwd, formatNumber, formatPercent, localeTag } from "@/i18n/format";
import type { Locale } from "@/i18n/messages";

type FleetRow = FleetProfile & {
  _count?: { drivers?: number; users?: number };
  drivers?: Array<{
    id: string;
    name: string;
    phone: string | null;
    status: string;
    vehicleType: string;
    performanceTier: string | null;
    throttledUntil: Date | string | null;
  }>;
};

type Tab = "profile" | "drivers" | "requests" | "scorecard" | "users";

function pct(value: number | null | undefined, locale: Locale): string {
  return value == null ? "n/a" : formatPercent(value, locale, 1);
}

/** Slugged the same way the server names the file, so both agree. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "fleet";
}

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

const inputClass =
  "w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide";

/* ── Profile: contacts + delivery pricing, editable in place ── */
function ProfilePricingSection({ fleet }: { fleet: FleetRow }) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: fleet.name,
    contactName: fleet.contactName ?? "",
    contactPhone: fleet.contactPhone ?? "",
    contactEmail: fleet.contactEmail ?? "",
    flatFeePerOrderKwd:
      fleet.flatFeePerOrderKwd == null ? "" : String(fleet.flatFeePerOrderKwd),
    perKmFeeKwd: fleet.perKmFeeKwd == null ? "" : String(fleet.perKmFeeKwd),
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fleetsApi.update(fleet.id, {
        name: form.name.trim(),
        contactName: form.contactName.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        flatFeePerOrderKwd: form.flatFeePerOrderKwd.trim() || null,
        perKmFeeKwd: form.perKmFeeKwd.trim() || null,
      });
      toast.success(t("toast.saved"));
      // The list row and this page's header show the fee and the name.
      await queryClient.invalidateQueries({ queryKey: ["darb", "fleets"] });
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          t("toast.failedSave"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6 max-w-xl space-y-4">
      <h3 className="text-xs uppercase tracking-wide font-medium text-sand-600">
        Company profile
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className={labelClass}>Company name</span>
          <input
            className={inputClass}
            dir="auto"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          <span className={labelClass}>Contact person</span>
          <input
            className={inputClass}
            dir="auto"
            value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })}
          />
        </label>
        <label>
          <span className={labelClass}>Contact phone</span>
          <input
            className={inputClass}
            dir="ltr"
            value={form.contactPhone}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
          />
        </label>
        <label>
          <span className={labelClass}>Contact email</span>
          <input
            className={inputClass}
            dir="ltr"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
          />
        </label>
      </div>

      <h3 className="text-xs uppercase tracking-wide font-medium text-sand-600 pt-2">
        Delivery pricing
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className={labelClass}>{t("fleetPortal.feePerOrder")}</span>
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            data-testid="fleet-fee-per-order"
            placeholder="0.000"
            className={cn(inputClass, "tabular-nums")}
            value={form.flatFeePerOrderKwd}
            onChange={(e) => setForm({ ...form, flatFeePerOrderKwd: e.target.value })}
          />
        </label>
        <label>
          <span className={labelClass}>Per km (optional)</span>
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            data-testid="fleet-per-km-fee"
            placeholder="0.000"
            className={cn(inputClass, "tabular-nums")}
            value={form.perKmFeeKwd}
            onChange={(e) => setForm({ ...form, perKmFeeKwd: e.target.value })}
          />
        </label>
      </div>
      <p className="text-xs text-sand-600">
        What this company earns per delivered order. Per-km is only for companies on the
        kilometre rate; leave it empty for a flat fee.
      </p>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        data-testid="fleet-profile-save"
        className="inline-flex items-center gap-1.5 px-4 h-9 rounded-pill bg-primary text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
      >
        {saving ? t("common.processing") : t("common.save")}
      </button>
    </section>
  );
}

/* ── Deductions recorded against this company's invoice ── */
function DeductionsSection({ fleet }: { fleet: FleetRow }) {
  const { t, locale } = useI18n();
  const toast = useToast();

  const deductionsQuery = useQuery({
    queryKey: ["darb", "fleets", fleet.id, "deductions"],
    queryFn: () => fleetsApi.deductions(fleet.id),
  });
  const rows = deductionsQuery.data?.data ?? [];

  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("DAMAGE");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function add() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    setBusy("add");
    try {
      await fleetsApi.addDeduction(fleet.id, {
        amountKwd: value,
        reason,
        note: note.trim() || undefined,
      });
      toast.success(t("toast.saved"));
      setAmount("");
      setNote("");
      setReason("DAMAGE");
      setAdding(false);
      await deductionsQuery.refetch();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          t("toast.failedSave"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    setBusy(id);
    try {
      await fleetsApi.cancelDeduction(fleet.id, id);
      await deductionsQuery.refetch();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          t("toast.failedSave"),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6 max-w-xl space-y-3"
      data-testid="fleet-deductions"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs uppercase tracking-wide font-medium text-sand-600">
          Invoice deductions
        </h3>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="h-8 px-3 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200"
          >
            + Add deduction
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-xl border border-sand-300 bg-white p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <label>
              <span className={labelClass}>Amount (KD)</span>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                autoFocus
                className={cn(inputClass, "tabular-nums", "h-9")}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              <span className={labelClass}>Reason</span>
              <select
                className={cn(inputClass, "h-9")}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {["DAMAGE", "FINE", "EQUIPMENT", "CASH_SHORTFALL", "SLA", "OTHER"].map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className={labelClass}>Note</span>
            <input
              className={cn(inputClass, "h-9")}
              dir="auto"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="h-8 px-3 rounded-full border border-sand-300 bg-white text-xs text-sand-700"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={busy === "add" || !(Number(amount) > 0)}
              onClick={() => void add()}
              className="h-8 px-3 rounded-full bg-primary text-white text-xs font-medium disabled:opacity-50"
            >
              {busy === "add" ? t("common.processing") : t("common.save")}
            </button>
          </div>
        </div>
      )}

      {deductionsQuery.isLoading ? (
        <p className="text-sm text-sand-600">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sand-600">Nothing withheld from invoices yet.</p>
      ) : (
        <ul className="divide-y divide-sand-200">
          {rows.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-sand-900 truncate" dir="auto">
                  {d.reason.replace(/_/g, " ")}
                  <span dir="ltr" className="tabular-nums ms-2 font-medium">
                    KD {Number(d.amountKwd).toFixed(3)}
                  </span>
                </p>
                <p className="text-[11px] text-sand-500 mt-0.5">
                  {formatDate(d.incurredAt, locale)}
                  {d.note ? ` · ${d.note}` : ""}
                </p>
              </div>
              <StatusBadge status={d.status === "PENDING" ? "PENDING" : d.status} />
              {d.status === "PENDING" && (
                <button
                  type="button"
                  disabled={busy === d.id}
                  onClick={() => void cancel(d.id)}
                  className="text-[11px] text-red-600 hover:text-red-700 shrink-0 disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Every driver under the company, with documents and expiries ── */
function DriversDocumentsSection({ fleet }: { fleet: FleetRow }) {
  const { t, locale } = useI18n();
  const toast = useToast();

  const docsQuery = useQuery({
    queryKey: ["darb", "fleets", fleet.id, "documents"],
    queryFn: () => fleetsApi.documents(fleet.id),
  });
  const allDocs = unwrapList<FleetDocument>(docsQuery.data);
  const companyDocs = allDocs.filter((d) => !d.driverId);

  async function openDoc(docId: string) {
    try {
      const { objectUrl } = await fleetsApi.documentFile(docId);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error(t("hqRequests.fileOpenFailed"));
    }
  }

  function DocChip({ doc }: { doc: FleetDocument }) {
    const hasFile = !!(doc.fileKey || doc.hasFile);
    return (
      <button
        type="button"
        onClick={() => hasFile && openDoc(doc.id)}
        disabled={!hasFile}
        title={hasFile ? t("hqRequests.viewFile") : t("fleetPortal.noFile")}
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border text-xs",
          hasFile
            ? "border-sand-300 bg-white text-sand-700 hover:bg-sand-100"
            : "border-sand-200 bg-sand-50 text-sand-400",
        )}
      >
        {doc.type.replace(/_/g, " ")}
        {doc.expiryDate ? (
          <span dir="ltr" className="tabular-nums">
            · {formatDate(doc.expiryDate, locale)}
          </span>
        ) : null}
        {!hasFile ? ` · ${t("fleetPortal.noFile")}` : ""}
      </button>
    );
  }

  return (
    <section className="space-y-3" data-testid="fleet-drivers-documents">
      <h3 className="text-xs uppercase tracking-wide font-medium text-sand-600">
        Drivers &amp; documents ({(fleet.drivers ?? []).length})
      </h3>

      {companyDocs.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-sand-500 mb-1.5">
            Legal documents
          </p>
          <ul className="flex flex-wrap gap-2">
            {companyDocs.map((d) => (
              <li key={d.id}>
                <DocChip doc={d} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {(fleet.drivers ?? []).length === 0 ? (
        <p className="text-sm text-sand-600">{t("errors.noData")}</p>
      ) : (
        <ul className="divide-y divide-sand-200">
          {(fleet.drivers ?? []).map((driver) => {
            const docs = allDocs.filter((d) => d.driverId === driver.id);
            return (
              <li key={driver.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-sand-900 truncate" dir="auto">
                      {driver.name}
                    </p>
                    <p className="text-[11px] text-sand-500 mt-0.5" dir="ltr">
                      {driver.phone ?? "n/a"} · {driver.vehicleType} · {docs.length} document
                      {docs.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <StatusBadge status={driver.status} />
                </div>
                {docs.length > 0 && (
                  <ul className="flex flex-wrap gap-2 mt-2">
                    {docs.map((d) => (
                      <li key={d.id}>
                        <DocChip doc={d} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ── Revision 12 — the review queue ── */
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
      const { objectUrl } = await fleetsApi.documentFile(docId);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error(t("errors.loadingData"));
    }
  }

  const requests = requestsQuery.data ?? [];

  if (requestsQuery.isLoading) {
    return <p className="text-sm text-sand-600">{t("common.loading")}</p>;
  }
  // A tab of its own now, so an empty queue says so instead of vanishing.
  if (requests.length === 0) {
    return <p className="text-sm text-sand-600">{t("fleetPortal.noRequests")}</p>;
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-sand-900">
        {t("hqRequests.tabApprovals")} ({requests.length})
      </h3>

      <ul className="space-y-3 max-w-2xl">
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
                    : r.type === "RATE_CHANGE"
                      ? `${t("fleetPortal.feePerOrder")}: ${formatKwd(
                          payload.currentKwd ?? "0",
                          locale,
                        )} → ${formatKwd(payload.flatFeePerOrderKwd ?? "0", locale)}${
                          payload.reason ? ` · ${payload.reason}` : ""
                        }`
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
                  {(r.documents ?? []).map((d) => {
                    const hasFile = !!(d.fileKey || d.hasFile);
                    return (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => hasFile && openDoc(d.id)}
                          disabled={!hasFile}
                          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-sand-300 bg-white text-xs text-sand-700 disabled:opacity-60 hover:bg-sand-100"
                        >
                          {d.type.replace(/_/g, " ")}
                          {d.expiryDate ? ` · ${formatDate(d.expiryDate, locale)}` : ""}
                          {!hasFile ? ` · ${t("fleetPortal.noFile")}` : ""}
                        </button>
                      </li>
                    );
                  })}
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

/* ── Portal logins (ADMIN only, matching both endpoints behind it) ── */
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
      await queryClient.invalidateQueries({ queryKey: ["darb", "fleets"] });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("toast.failedSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6 max-w-xl">
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

/* ── Scorecard + payout statements ── */
function ScorecardSection({ fleet }: { fleet: FleetRow }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { hasRole } = useRole();
  const [downloading, setDownloading] = useState(false);
  // Revision 13 (#8). The endpoint is ACCOUNTANT+; showing the button to
  // anyone else would only produce a 403 they cannot act on.
  const canPay = hasRole("ACCOUNTANT");
  const [paying, setPaying] = useState<string | null>(null);
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

  async function openInvoice(statementId: string) {
    try {
      const { objectUrl } = await fleetsApi.statementInvoice(statementId);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error(t("fleetPortal.noInvoiceOnStatement"));
    }
  }

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
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2 flex-wrap">
        <span dir="ltr" className="text-sm text-sand-700 tabular-nums">
          {t("fleetPortal.feePerOrder")}: {formatKwd(fleet.flatFeePerOrderKwd, locale)}
        </span>
        <button
          type="button"
          onClick={() => void downloadFleet()}
          disabled={downloading}
          className="ms-auto inline-flex items-center gap-1.5 px-3 h-8 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors disabled:opacity-50"
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
                  {row.invoice ? (
                    <button
                      type="button"
                      onClick={() => void openInvoice(row.id)}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200"
                    >
                      <FileText size={12} aria-hidden="true" />
                      {t("fleetPortal.importInvoice")}
                    </button>
                  ) : (
                    <span className="text-xs text-sand-500">
                      {t("fleetPortal.noInvoiceOnStatement")}
                    </span>
                  )}
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
    </div>
  );
}

export default function FleetDetailPage() {
  const { t } = useI18n();
  const { isAdmin } = useRole();
  const params = useParams<{ id: string }>();
  const fleetId = params?.id;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("profile");

  const fleetQuery = useQuery({
    queryKey: ["darb", "fleets", fleetId],
    queryFn: () => fleetsApi.getById(fleetId!) as Promise<FleetRow>,
    enabled: !!fleetId,
  });
  const fleet = (fleetQuery.data ?? null) as FleetRow | null;

  if (fleetQuery.isLoading) return <PageSkeleton statCards={0} tableRows={6} tableCols={4} />;
  if (fleetQuery.error || !fleet) {
    return (
      <ErrorState
        error={
          fleetQuery.error instanceof Error ? fleetQuery.error.message : t("errors.notFound")
        }
        onRetry={() => fleetQuery.refetch()}
      />
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: t("vendorsPage.profile") },
    { key: "drivers", label: t("fleetPortal.navRoster") },
    { key: "requests", label: t("hqRequests.tabApprovals") },
    { key: "scorecard", label: t("fleetPortal.scorecardTitle") },
    ...(isAdmin ? [{ key: "users" as Tab, label: t("vendorsPage.users") }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.push("/fleets")}
            className="inline-flex items-center gap-1 text-xs text-sand-600 hover:text-sand-900 transition-colors mb-1"
          >
            <DirectionalIcon kind="chevron-back" size={12} aria-hidden="true" />
            {t("simple.setupCompanies")}
          </button>
          <h1 className="font-display text-display-sm text-sand-900 truncate" dir="auto">
            {fleet.name}
          </h1>
          <p className="text-sm text-sand-600 mt-0.5">
            {(fleet.drivers ?? []).length} {t("fleetPortal.navRoster").toLowerCase()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={fleet.disciplineStatus} />
          <StatusBadge status={fleet.isActive ? "ACTIVE" : "INACTIVE"} />
        </div>
      </div>

      {/* The way into the partner's own portal, read-only. ADMIN only,
          which is what the server admits (middleware/fleetScope). */}
      {isAdmin && (
        <Link
          href={`/fleet-portal?fleetPartnerId=${fleet.id}`}
          className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors"
        >
          <Eye size={13} aria-hidden="true" />
          {t("vendorsPage.viewPortal")}
        </Link>
      )}

      {/* Tab bar */}
      <div className="inline-flex p-1 rounded-pill bg-sand-200 flex-wrap">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              "px-4 py-1.5 text-xs font-medium rounded-pill transition-all duration-250 ease-sierra-out",
              tab === item.key ? "bg-white text-sand-900 shadow-soft" : "text-sand-700 hover:text-sand-900"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div className="space-y-6">
          <ProfilePricingSection key={`pp-${fleet.id}`} fleet={fleet} />
          <DeductionsSection key={`dd-${fleet.id}`} fleet={fleet} />
        </div>
      )}
      {tab === "drivers" && <DriversDocumentsSection fleet={fleet} />}
      {tab === "requests" && <RequestsSection fleet={fleet} />}
      {tab === "scorecard" && <ScorecardSection fleet={fleet} />}
      {tab === "users" && isAdmin && <PortalLoginsSection fleet={fleet} />}
    </div>
  );
}
