"use client";
// Darb 2.0 — /fleet-portal/team: the delivery company's own portal logins.
// Revision 13 (#6).
//
// The client asked for "a Team tab, same as the Vendor concept", with the
// branches replaced by the other delivery companies in the same group. So this
// is deliberately the merchant Team page with two words changed: Darb could
// always create a fleet's logins and the fleet could not, which made Darb the
// bottleneck for something an owner should do themselves.
//
// The screen opens on the TEAM tab alone (revision 11 #9's rule: a granted tab
// must be able to appear, so no second role gate sits on top of it). What stays
// OWNER-only is the dangerous work on it — minting a login, switching one off,
// changing what anyone opens — enforced on the endpoint AND by hiding the
// control, so nobody is shown a button that answers 403.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, UserCheck, UserPlus, UserX } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import FleetTabPicker from "@/components/fleet/FleetTabPicker";
import { fleetApi } from "@/lib/darbApi";
import { FLEET_TAB_ORDER, fleetRoleDefaultTabs } from "@/lib/fleetTabs";
import type { FleetPortalRole, FleetTab, FleetTeamUser } from "@/types/darb";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate } from "@/i18n/format";

const inputClass =
  "w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";

/** What each role is for, in the delivery company's own words. */
const ROLE_HINT: Record<FleetPortalRole, string> = {
  OWNER: "fleetTeam.hintOwner",
  OPERATIONS: "fleetTeam.hintOperations",
  FINANCE: "fleetTeam.hintFinance",
};

export default function FleetTeamPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    fleetRole: "OPERATIONS" as FleetPortalRole,
    // null means every company in the group, which is what an owner wants for
    // most of their staff and what a one-company fleet always wants.
    companies: null as string[] | null,
    fleetTabs: null as FleetTab[] | null,
  });

  const [editing, setEditing] = useState<FleetTeamUser | null>(null);
  const [editTabs, setEditTabs] = useState<FleetTab[] | null>(null);
  const [editCompanies, setEditCompanies] = useState<string[] | null>(null);

  const teamQuery = useQuery({
    queryKey: ["darb", "fleet", "team"],
    queryFn: () => fleetApi.team(),
  });
  const meQuery = useQuery({
    queryKey: ["darb", "fleet", "me"],
    queryFn: () => fleetApi.me(),
    staleTime: 60_000,
  });

  // Undefined while /me is in flight, so the buttons appear once the answer
  // lands rather than flashing and vanishing.
  const isOwner = (meQuery.data?.portalRole ?? "OWNER") === "OWNER";
  const companies = teamQuery.data?.companies ?? [];

  const fail = (err: unknown) =>
    toast.error(
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave"),
    );

  async function save() {
    setSaving(true);
    try {
      await fleetApi.createTeamUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        fleetRole: form.fleetRole,
        fleetTabs: form.fleetTabs,
        fleetPartnerIds: form.companies,
      });
      toast.success(t("fleetTeam.created"));
      setOpen(false);
      setForm({
        name: "", email: "", phone: "", password: "",
        fleetRole: "OPERATIONS", companies: null, fleetTabs: null,
      });
      await queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "team"] });
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function saveAccess() {
    if (!editing) return;
    setSaving(true);
    try {
      await fleetApi.updateTeamUser(editing.id, {
        fleetTabs: editTabs,
        fleetPartnerIds: editCompanies,
      });
      toast.success(t("fleetTeam.accessSaved"));
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "team"] });
      // The caller's own rail reads the same /me payload, so it has to refetch
      // if the owner just changed their own team's access.
      await queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "me"] });
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: FleetTeamUser) {
    try {
      const next = !(u.isActive ?? true);
      await fleetApi.updateTeamUser(u.id, { isActive: next });
      toast.success(next ? t("fleetPortal.activated") : t("fleetPortal.deactivatedOk"));
      await queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "team"] });
    } catch (err) {
      fail(err);
    }
  }

  if (teamQuery.isLoading) return <PageSkeleton statCards={0} tableRows={5} tableCols={6} />;
  if (teamQuery.error) {
    return (
      <ErrorState
        error={teamQuery.error instanceof Error ? teamQuery.error.message : t("errors.loadingData")}
        onRetry={() => teamQuery.refetch()}
      />
    );
  }

  const users = teamQuery.data?.users ?? [];
  const canSubmit =
    form.name.trim() !== "" &&
    form.email.trim() !== "" &&
    form.password.length >= 8 &&
    !saving;

  const companyNames = (ids: string[] | null): string =>
    ids === null
      ? t("fleetTeam.allCompanies")
      : ids
          .map((id) => companies.find((c) => c.id === id)?.name ?? id)
          .join(", ");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-sm text-sand-900">{t("fleetTeam.title")}</h1>
          <p className="text-sm text-sand-600 mt-1">{t("fleetTeam.subtitle")}</p>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            <UserPlus size={15} aria-hidden="true" />
            {t("fleetTeam.add")}
          </button>
        )}
      </div>

      <DataTable
        columns={[
          { key: "name", label: t("vendorsPage.name") },
          { key: "email", label: t("vendorTeam.email") },
          {
            key: "fleetRole",
            label: t("vendorTeam.role"),
            render: (value: FleetPortalRole) => <span>{t(`fleetTeam.role${value}`)}</span>,
          },
          {
            // The vendor portal's branch column, in fleet terms.
            key: "fleetPartnerIds",
            label: t("fleetTeam.companies"),
            sortable: false,
            render: (_v: unknown, row: FleetTeamUser) => (
              <span dir="auto">{companyNames(row.fleetPartnerIds)}</span>
            ),
            exportValue: (_v: unknown, row: FleetTeamUser) => companyNames(row.fleetPartnerIds),
          },
          {
            key: "isActive",
            label: t("vendorTeam.access"),
            render: (value: boolean | undefined, row: FleetTeamUser) => {
              const badge = (
                <StatusBadge
                  status={value === false ? "INACTIVE" : "ACTIVE"}
                  label={value === false ? t("status.inactive") : t("vendorsPage.active")}
                />
              );
              // Switching somebody's access off is the owner's call. A reader
              // sees the state without a button that would only 403.
              return isOwner && row.id !== user?.id ? (
                <button type="button" onClick={() => void toggleActive(row)}>
                  {badge}
                </button>
              ) : (
                badge
              );
            },
          },
          {
            key: "effectiveTabs",
            label: t("vendorTeam.tabsColumn"),
            sortable: false,
            render: (_v: unknown, row: FleetTeamUser) => {
              const tabs = row.effectiveTabs ?? fleetRoleDefaultTabs(row.fleetRole);
              if (tabs.length === FLEET_TAB_ORDER.length) {
                return <span className="text-sand-600 text-xs">{t("vendorTeam.tabsAll")}</span>;
              }
              if (tabs.length === 0) {
                return <span className="text-red-600 text-xs">{t("errors.noData")}</span>;
              }
              return (
                <span className="flex flex-wrap gap-1">
                  {FLEET_TAB_ORDER.filter((x) => tabs.includes(x)).map((tab) => (
                    <span
                      key={tab}
                      className="inline-flex items-center px-2 py-0.5 rounded-pill bg-sand-100 text-sand-700 text-[11px] font-medium"
                    >
                      {t(`fleetTeam.tab${tab}`)}
                    </span>
                  ))}
                </span>
              );
            },
            exportValue: (_v: unknown, row: FleetTeamUser) =>
              (row.effectiveTabs ?? fleetRoleDefaultTabs(row.fleetRole)).join(" "),
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
          {
            key: "id",
            label: "",
            sortable: false,
            render: (_v: unknown, row: FleetTeamUser) =>
              !isOwner ? null : row.id === user?.id ? (
                // An owner cannot narrow their own access: it would be a way to
                // lock the company out of the only screen that could undo it.
                // The endpoint refuses it too.
                <span className="text-xs text-sand-500">{t("vendorTeam.cannotEditSelf")}</span>
              ) : (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(row);
                      setEditTabs(row.fleetTabs ?? null);
                      setEditCompanies(row.fleetPartnerIds ?? null);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors"
                  >
                    <SlidersHorizontal size={12} aria-hidden="true" />
                    {t("vendorTeam.editAccess")}
                  </button>
                  {/* Client note: switching somebody off was only ever a click
                      on the Active badge, which nobody reads as a button. It
                      is a named action now, and it says which way it goes. */}
                  <button
                    type="button"
                    onClick={() => void toggleActive(row)}
                    className={
                      row.isActive === false
                        ? "inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill border border-sand-300 text-xs font-medium text-sand-700 hover:bg-sand-100"
                        : "inline-flex items-center gap-1.5 px-3.5 h-9 rounded-pill border border-red-200 text-xs font-medium text-red-700 hover:bg-red-50"
                    }
                  >
                    {row.isActive === false ? (
                      <UserCheck size={12} aria-hidden="true" />
                    ) : (
                      <UserX size={12} aria-hidden="true" />
                    )}
                    {row.isActive === false
                      ? t("fleetPortal.activate")
                      : t("fleetPortal.deactivate")}
                  </button>
                </span>
              ),
          },
        ]}
        data={users}
        emptyMessage={t("fleetTeam.empty")}
      />

      <SlidePanel open={open} onClose={() => setOpen(false)} title={t("fleetTeam.add")}>
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
              value={form.fleetRole}
              onChange={(e) =>
                setForm({ ...form, fleetRole: e.target.value as FleetPortalRole })
              }
              className={inputClass}
            >
              <option value="OWNER">{t("fleetTeam.roleOWNER")}</option>
              <option value="OPERATIONS">{t("fleetTeam.roleOPERATIONS")}</option>
              <option value="FINANCE">{t("fleetTeam.roleFINANCE")}</option>
            </select>
            <p className="mt-1.5 text-xs text-sand-600">{t(ROLE_HINT[form.fleetRole])}</p>
          </div>

          {/* Client note: the panel has to ask whether this person covers every
              company or one of them. It used to hide itself for a fleet with a
              single company, which is exactly when somebody reads the omission
              as the question never having been asked. */}
          <CompanyPicker
            companies={companies}
            value={form.companies}
            onChange={(next) => setForm({ ...form, companies: next })}
          />

          <FleetTabPicker
            fleetRole={form.fleetRole}
            value={form.fleetTabs}
            onChange={(next) => setForm({ ...form, fleetTabs: next })}
          />

          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void save()}
            className="w-full h-11 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {saving ? t("common.processing") : t("fleetTeam.add")}
          </button>
        </div>
      </SlidePanel>

      <SlidePanel
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `${t("vendorTeam.editAccess")} — ${editing.name}` : t("vendorTeam.editAccess")}
      >
        {editing && (
          <div className="space-y-5">
            <div className="rounded-xl bg-sand-100 p-4 text-sm space-y-1">
              <p dir="auto" className="font-medium text-sand-900">{editing.name}</p>
              <p dir="ltr" className="text-xs text-sand-600">{editing.email}</p>
              <p className="text-xs text-sand-600">
                {t("vendorTeam.role")}: {t(`fleetTeam.role${editing.fleetRole}`)}
              </p>
            </div>

            <CompanyPicker
              companies={companies}
              value={editCompanies}
              onChange={setEditCompanies}
            />

            <FleetTabPicker
              fleetRole={editing.fleetRole}
              value={editTabs}
              onChange={setEditTabs}
            />

            <button
              type="button"
              disabled={saving}
              onClick={() => void saveAccess()}
              className="w-full h-11 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {saving ? t("common.processing") : t("vendorTeam.save")}
            </button>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}

/**
 * Which delivery companies in the group this login may act for.
 *
 * The vendor portal's branch dropdown, except a fleet login can hold several,
 * so it is chips rather than a select. Choosing all of them is stored as "all",
 * not as a list, so a login keeps working when the group gains a company.
 */
function CompanyPicker({
  companies,
  value,
  onChange,
}: {
  companies: Array<{ id: string; name: string }>;
  value: string[] | null;
  onChange: (next: string[] | null) => void;
}) {
  const { t } = useI18n();
  const all = value === null;

  const toggle = (id: string) => {
    const current = value ?? companies.map((c) => c.id);
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : companies.filter((c) => c.id === id || current.includes(c.id)).map((c) => c.id);
    onChange(next.length === 0 || next.length === companies.length ? null : next);
  };

  return (
    <div>
      <span className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
        {t("fleetTeam.access")} *
      </span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={all}
          className={
            all
              ? "px-3.5 h-9 rounded-pill text-xs font-medium border bg-primary text-white border-primary"
              : "px-3.5 h-9 rounded-pill text-xs font-medium border bg-white text-sand-600 border-sand-300 hover:bg-sand-100"
          }
        >
          {t("fleetTeam.allCompanies")}
        </button>
        {companies.map((c) => {
          const on = !all && (value ?? []).includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              aria-pressed={on}
              dir="auto"
              className={
                on
                  ? "px-3.5 h-9 rounded-pill text-xs font-medium border bg-primary text-white border-primary"
                  : "px-3.5 h-9 rounded-pill text-xs font-medium border bg-white text-sand-600 border-sand-300 hover:bg-sand-100"
              }
            >
              {c.name}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-sand-600">
        {companies.length > 1 ? t("fleetTeam.companiesHint") : t("fleetTeam.oneCompanyHint")}
      </p>
    </div>
  );
}
