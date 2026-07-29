"use client";
// Darb 2.0 — /vendor/team: the shop's own portal users. Revision 8 (#7).
//
// Darb could always create a shop's logins; the shop could not, which made
// Darb the bottleneck for something an owner should do themselves. An owner
// adds their accountant, or gives a branch supervisor a login for that branch
// only, without asking anyone.
//
// OWNER only, on both sides: the rail hides it, the layout fences the route,
// and the endpoints answer 403 to anyone else.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import { vendorApi } from "@/lib/darbApi";
import type { VendorPortalRole, VendorUser } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate } from "@/i18n/format";

const inputClass =
  "w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";

/** What each role is for, in the shop's own words. */
const ROLE_HINT: Record<VendorPortalRole, string> = {
  OWNER: "vendorTeam.hintOwner",
  FINANCE: "vendorTeam.hintFinance",
  ORDER_TRACKING: "vendorTeam.hintTracking",
};

export default function VendorTeamPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    vendorRole: "ORDER_TRACKING" as VendorPortalRole,
    branchId: "",
  });

  const teamQuery = useQuery({
    queryKey: ["darb", "vendor", "team"],
    queryFn: () => vendorApi.team(),
  });
  const meQuery = useQuery({
    queryKey: ["darb", "vendor", "me"],
    queryFn: () => vendorApi.me(),
    staleTime: 60_000,
  });
  const branches = useMemo(() => meQuery.data?.branches ?? [], [meQuery.data?.branches]);

  async function save() {
    setSaving(true);
    try {
      await vendorApi.createTeamUser({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        vendorRole: form.vendorRole,
        // Only a tracker can be pinned to a branch, and only optionally: a
        // tracker with no branch follows all of them.
        branchId: form.vendorRole === "ORDER_TRACKING" ? form.branchId || null : null,
      });
      toast.success(t("vendorTeam.created"));
      setOpen(false);
      setForm({ name: "", email: "", phone: "", password: "", vendorRole: "ORDER_TRACKING", branchId: "" });
      await queryClient.invalidateQueries({ queryKey: ["darb", "vendor", "team"] });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: VendorUser) {
    try {
      await vendorApi.updateTeamUser(u.id, { isActive: !(u.isActive ?? true) });
      await queryClient.invalidateQueries({ queryKey: ["darb", "vendor", "team"] });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave");
      toast.error(msg);
    }
  }

  if (teamQuery.isLoading) return <PageSkeleton statCards={0} tableRows={5} tableCols={5} />;
  if (teamQuery.error) {
    return (
      <ErrorState
        error={teamQuery.error instanceof Error ? teamQuery.error.message : t("errors.loadingData")}
        onRetry={() => teamQuery.refetch()}
      />
    );
  }

  const users = teamQuery.data ?? [];
  const canSubmit =
    form.name.trim() !== "" &&
    form.email.trim() !== "" &&
    form.password.length >= 8 &&
    !saving;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-sm text-sand-900">{t("vendorTeam.title")}</h1>
          <p className="text-sm text-sand-600 mt-1">{t("vendorTeam.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 h-10 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          <UserPlus size={15} aria-hidden="true" />
          {t("vendorTeam.add")}
        </button>
      </div>

      <DataTable
        columns={[
          { key: "name", label: t("vendorsPage.name") },
          { key: "email", label: t("vendorTeam.email") },
          {
            key: "vendorRole",
            label: t("vendorTeam.role"),
            render: (value: VendorPortalRole | null) => (
              <span>{value ? t(`vendorTeam.role${value}`) : t("vendorTeam.roleOWNER")}</span>
            ),
          },
          {
            key: "branch",
            label: t("vendorsPage.branches"),
            render: (_v: unknown, row: VendorUser) => (
              <span dir="auto">{row.branch?.name ?? t("vendorTeam.allBranches")}</span>
            ),
          },
          {
            key: "isActive",
            label: t("vendorTeam.access"),
            render: (value: boolean | undefined, row: VendorUser) => (
              <button type="button" onClick={() => void toggleActive(row)}>
                <StatusBadge
                  status={value === false ? "INACTIVE" : "ACTIVE"}
                  label={value === false ? t("status.inactive") : t("vendorsPage.active")}
                />
              </button>
            ),
          },
          {
            key: "createdAt",
            label: t("vendorTeam.added"),
            render: (value: string) => (
              <span dir="ltr" className="tabular-nums">
                {value ? formatDate(value, locale) : t("common.notAvailable")}
              </span>
            ),
          },
        ]}
        data={users}
        emptyMessage={t("vendorTeam.empty")}
      />

      <SlidePanel open={open} onClose={() => setOpen(false)} title={t("vendorTeam.add")}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              {t("vendorsPage.name")} *
            </label>
            <input
              dir="auto"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              {t("vendorTeam.email")} *
            </label>
            <input
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              {t("vendorsPage.phone")}
            </label>
            <input
              type="tel"
              dir="ltr"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              {t("vendorTeam.password")} *
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-sand-600">{t("vendorTeam.passwordHint")}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              {t("vendorTeam.role")} *
            </label>
            <select
              value={form.vendorRole}
              onChange={(e) => setForm({ ...form, vendorRole: e.target.value as VendorPortalRole })}
              className={inputClass}
            >
              <option value="OWNER">{t("vendorTeam.roleOWNER")}</option>
              <option value="FINANCE">{t("vendorTeam.roleFINANCE")}</option>
              <option value="ORDER_TRACKING">{t("vendorTeam.roleORDER_TRACKING")}</option>
            </select>
            <p className="mt-1.5 text-xs text-sand-600">{t(ROLE_HINT[form.vendorRole])}</p>
          </div>
          {/* Only a tracker can be pinned to one branch. Owner and finance are
              shop-wide, so offering them a branch would be offering a choice
              the server ignores. */}
          {form.vendorRole === "ORDER_TRACKING" && branches.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("vendorsPage.branches")}
              </label>
              <select
                value={form.branchId}
                onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                className={inputClass}
              >
                <option value="">{t("vendorTeam.allBranches")}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void save()}
            className="w-full h-11 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {saving ? t("common.processing") : t("vendorTeam.add")}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}
