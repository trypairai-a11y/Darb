"use client";
import { useState, useEffect, useCallback } from "react";
import { useApiGet } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/cn";
import { Plus, X, Shield, UserX, UserCheck, Loader2, Bell, Check } from "lucide-react";
import api from "@/lib/api";
import BackToSetup from "@/components/shared/BackToSetup";
import { useI18n } from "@/i18n/I18nProvider";

const ROLES = ["ADMIN", "OPS_MANAGER", "SUPERVISOR", "ACCOUNTANT", "VIEWER"] as const;

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-50 text-red-600",
  OPS_MANAGER: "bg-blue-50 text-blue-600",
  SUPERVISOR: "bg-purple-50 text-purple-600",
  ACCOUNTANT: "bg-green-50 text-green-600",
  VIEWER: "bg-gray-100 text-gray-500",
};

/** Roles that can own a company as its Darb account manager (revision #20). */
const INTERNAL_ROLES = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"];

type Tab = "companies" | "users" | "notifications" | "profile";

function UsersTab() {
  const { data, refetch } = useApiGet<any>("/api/users?limit=100");
  const users = data?.data || [];
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", password: "", role: "VIEWER", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/users", inviteForm);
      setShowInvite(false);
      setInviteForm({ name: "", email: "", password: "", role: "VIEWER", phone: "" });
      refetch();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(userId: string) {
    setToggling(userId);
    try {
      await api.put(`/api/users/${userId}/toggle-active`);
      refetch();
    } catch (err: any) {
      console.error(err);
    } finally {
      setToggling(null);
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    try {
      await api.put(`/api/users/${userId}`, { role });
      refetch();
    } catch (err: any) {
      console.error(err);
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors">
          <Plus size={16} /> Invite User
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="text-left text-xs font-medium text-secondary px-5 py-3">Name</th>
              <th className="text-left text-xs font-medium text-secondary px-5 py-3">Email</th>
              <th className="text-left text-xs font-medium text-secondary px-5 py-3">Role</th>
              <th className="text-left text-xs font-medium text-secondary px-5 py-3">Status</th>
              <th className="text-left text-xs font-medium text-secondary px-5 py-3">Last Login</th>
              <th className="text-right text-xs font-medium text-secondary px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-25">
                <td className="px-5 py-3 text-sm font-medium">{u.name}</td>
                <td className="px-5 py-3 text-sm text-secondary">{u.email}</td>
                <td className="px-5 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    className="appearance-none px-2 py-0.5 rounded-md text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                    style={{ backgroundColor: "transparent" }}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r.replace("_", " ")}</option>
                    ))}
                  </select>
                  <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium sr-only", ROLE_COLORS[u.role])}>
                    {u.role.replace("_", " ")}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium",
                    u.isActive ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500")}>
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3 text-sm text-secondary">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => handleToggleActive(u.id)}
                    disabled={toggling === u.id}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      u.isActive ? "text-red-400 hover:bg-red-50 hover:text-red-600" : "text-green-400 hover:bg-green-50 hover:text-green-600"
                    )}
                    title={u.isActive ? "Deactivate" : "Activate"}
                  >
                    {toggling === u.id ? <Loader2 size={14} className="animate-spin" /> : u.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-secondary">No users found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showInvite && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowInvite(false)}>
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Invite User</h2>
              <button onClick={() => setShowInvite(false)} className="p-1 hover:bg-gray-50 rounded-lg"><X size={18} /></button>
            </div>

            {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm">{error}</div>}

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Name *</label>
                <input type="text" required value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Full name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Email *</label>
                <input type="email" required value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="user@example.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Password *</label>
                <input type="password" required value={inviteForm.password}
                  onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Min 8 characters" minLength={8} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Role *</label>
                  <select value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Phone</label>
                  <input type="text" value={inviteForm.phone}
                    onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="+965 xxxx xxxx" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowInvite(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-50">
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {submitting ? "Creating..." : "Invite User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const VIOLATION_TYPES = [
  { key: "CASH_THRESHOLD_EXCEEDED", label: "Cash Threshold Exceeded", severity: "CRITICAL" },
  { key: "GPS_OFF", label: "GPS Off", severity: "HIGH" },
  { key: "OUT_OF_ZONE", label: "Out of Zone", severity: "HIGH" },
  { key: "ZONE_MISMATCH", label: "Zone Mismatch", severity: "HIGH" },
  { key: "SELFIE_FAIL", label: "Selfie Fail", severity: "HIGH" },
  { key: "SHIFT_NOT_BOOKED", label: "Shift Not Booked", severity: "HIGH" },
  { key: "LATE_CLOCK_IN", label: "Late Clock In", severity: "MEDIUM" },
  { key: "EARLY_CLOCK_OUT", label: "Early Clock Out", severity: "MEDIUM" },
  { key: "EQUIPMENT_MISSING", label: "Equipment Missing", severity: "MEDIUM" },
  { key: "ORDER_CLICK_THROUGH", label: "Order Click Through", severity: "MEDIUM" },
  { key: "cash_overdue", label: "Cash Overdue (Alert)", severity: "HIGH" },
  { key: "shift_not_booked", label: "Shift Booking Reminder", severity: "HIGH" },
];

const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: "bg-red-500",
  HIGH: "bg-orange-400",
  MEDIUM: "bg-yellow-400",
  LOW: "bg-blue-400",
};

interface NotificationRule {
  id: string;
  eventType: string;
  role: string;
  enabled: boolean;
}

function NotificationsTab() {
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      const { data } = await api.get("/api/notifications/rules");
      setRules(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  function isEnabled(eventType: string, role: string): boolean {
    const rule = rules.find((r) => r.eventType === eventType && r.role === role);
    return rule?.enabled ?? false;
  }

  async function toggleRule(eventType: string, role: string) {
    const key = `${eventType}-${role}`;
    setSaving(key);
    const current = isEnabled(eventType, role);
    try {
      await api.put("/api/notifications/rules", { eventType, role, enabled: !current });
      setRules((prev) => {
        const idx = prev.findIndex((r) => r.eventType === eventType && r.role === role);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], enabled: !current };
          return updated;
        }
        return [...prev, { id: "", eventType, role, enabled: !current }];
      });
      setSaved(key);
      setTimeout(() => setSaved(null), 1200);
    } catch {}
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-secondary" />
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-secondary mb-4">
        Configure which roles receive in-app notifications for each violation type. Toggle cells to enable or disable.
      </p>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-secondary px-5 py-3 sticky left-0 bg-white min-w-[220px]">
                  Violation Type
                </th>
                {ROLES.map((role) => (
                  <th key={role} className="text-center text-xs font-medium text-secondary px-4 py-3 min-w-[100px]">
                    {role.replace("_", " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VIOLATION_TYPES.map((vt) => (
                <tr key={vt.key} className="border-b border-gray-50 last:border-0 hover:bg-gray-25">
                  <td className="px-5 py-3 sticky left-0 bg-white">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", SEVERITY_DOT[vt.severity])} />
                      <span className="text-sm font-medium text-foreground">{vt.label}</span>
                    </div>
                  </td>
                  {ROLES.map((role) => {
                    const key = `${vt.key}-${role}`;
                    const enabled = isEnabled(vt.key, role);
                    const isSaving = saving === key;
                    const justSaved = saved === key;
                    return (
                      <td key={role} className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleRule(vt.key, role)}
                          disabled={isSaving}
                          className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center mx-auto transition-all",
                            enabled
                              ? "bg-primary/10 text-primary hover:bg-primary/20"
                              : "bg-gray-50 text-gray-300 hover:bg-gray-100 hover:text-gray-400"
                          )}
                        >
                          {isSaving ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : justSaved ? (
                            <Check size={14} className="text-green-500" />
                          ) : enabled ? (
                            <Bell size={14} />
                          ) : (
                            <Bell size={14} />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-6 text-xs text-secondary">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Critical</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400" /> High</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400" /> Medium</span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("companies");
  const { user } = useAuth();
  const tabLabels: Record<Tab, string> = {
    companies: t("settingsPage.tabCompanies"),
    users: t("settingsPage.tabUsers"),
    notifications: t("settingsPage.tabNotifications"),
    profile: t("settingsPage.tabProfile"),
  };
  const { data: companiesData, refetch: refetchCompanies } = useApiGet<any>("/api/companies?limit=50");
  // Internal staff only — a VENDOR or FLEET portal login can never be an
  // account manager (revision #20), and the API enforces the same rule.
  const { data: staffData } = useApiGet<any>("/api/users?limit=100");
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: "", kind: "FLEET" });
  const [kindFilter, setKindFilter] = useState<"ALL" | "FLEET" | "VENDOR">("ALL");

  // Profile form
  const [profileForm, setProfileForm] = useState({ name: user?.name || "", email: user?.email || "" });

  const allCompanies = companiesData?.data || [];
  const companies =
    kindFilter === "ALL"
      ? allCompanies
      : allCompanies.filter((c: any) => (c.kind ?? "FLEET") === kindFilter);

  const staff = (staffData?.data || []).filter((u: any) => INTERNAL_ROLES.includes(u.role));

  // Revision #17 — the running total across every company, not per row.
  const totalDrivers = allCompanies.reduce(
    (sum: number, c: any) => sum + (c._count?.drivers || 0),
    0
  );

  const handleAssignManager = async (companyId: string, accountManagerId: string) => {
    try {
      await api.put(`/api/companies/${companyId}`, { accountManagerId });
      refetchCompanies();
    } catch (err) {
      console.error(err);
    }
  };

  const handleChangeKind = async (companyId: string, kind: string) => {
    try {
      await api.put(`/api/companies/${companyId}`, { kind });
      refetchCompanies();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddCompany = async () => {
    try {
      await api.post("/api/companies", newCompany);
      setShowAddCompany(false);
      refetchCompanies();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      await api.put("/api/auth/me", profileForm);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 w-full max-w-none">
      <BackToSetup />
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("simple.setupPeople")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("simple.setupPeopleDesc")}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(["companies", "users", "notifications", "profile"] as Tab[]).map((tabKey) => (
          <button key={tabKey} onClick={() => setTab(tabKey)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              tab === tabKey ? "bg-white text-foreground shadow-sm" : "text-secondary hover:text-foreground"
            )}>
            {tabLabels[tabKey]}
          </button>
        ))}
      </div>

      {tab === "companies" && (
        <div>
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Revision #21 — switch the table between vendors and fleets. */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                {(["ALL", "FLEET", "VENDOR"] as const).map((key) => (
                  <button key={key} onClick={() => setKindFilter(key)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                      kindFilter === key ? "bg-white text-foreground shadow-sm" : "text-secondary hover:text-foreground"
                    )}>
                    {key === "ALL"
                      ? t("settingsPage.kindAll")
                      : key === "FLEET"
                        ? t("settingsPage.kindFleets")
                        : t("settingsPage.kindVendors")}
                  </button>
                ))}
              </div>
              {/* Revision #17 — total drivers across all companies. */}
              <div className="text-sm">
                <span className="text-secondary">{t("settingsPage.totalDrivers")}: </span>
                <span className="font-semibold tabular-nums" dir="ltr">{totalDrivers}</span>
              </div>
            </div>
            <button onClick={() => setShowAddCompany(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors">
              <Plus size={16} /> {t("settingsPage.addCompany")}
            </button>
          </div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("settingsPage.name")}</th>
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("settingsPage.typeCol")}</th>
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("settingsPage.accountManagerCol")}</th>
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("companies.drivers")}</th>
                  <th className="text-start text-xs font-medium text-secondary px-5 py-3">{t("table.status")}</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company: any) => (
                  <tr key={company.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-25">
                    <td className="px-5 py-3 text-sm font-medium">
                      {company.name}
                      {company.ownerGroup && (
                        <span className="block text-xs text-secondary">{company.ownerGroup.name}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={company.kind ?? "FLEET"}
                        onChange={(e) => handleChangeKind(company.id, e.target.value)}
                        aria-label={t("settingsPage.typeCol")}
                        className={cn(
                          "appearance-none px-2 py-0.5 rounded-md text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20",
                          (company.kind ?? "FLEET") === "VENDOR"
                            ? "bg-blue-50 text-blue-600"
                            : "bg-green-50 text-green-600"
                        )}
                      >
                        <option value="FLEET">{t("settingsPage.kindFleet")}</option>
                        <option value="VENDOR">{t("settingsPage.kindVendor")}</option>
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={company.accountManager?.id ?? ""}
                        onChange={(e) => handleAssignManager(company.id, e.target.value)}
                        aria-label={t("settingsPage.accountManagerCol")}
                        className="appearance-none px-2 py-0.5 rounded-md text-xs border-0 bg-transparent cursor-pointer text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">{t("settingsPage.unassigned")}</option>
                        {staff.map((u: any) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3 text-sm text-secondary tabular-nums">{company._count?.drivers || 0}</td>
                    <td className="px-5 py-3">
                      <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium",
                        company.isActive ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500")}>
                        {company.isActive ? t("status.active") : t("status.inactive")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showAddCompany && (
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold">{t("settingsPage.addCompany")}</h2>
                  <button onClick={() => setShowAddCompany(false)} className="p-1 hover:bg-gray-50 rounded-lg" aria-label={t("common.close")}><X size={18} /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-secondary mb-1.5">{t("settingsPage.companyName")}</label>
                    <input value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} dir="auto"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-secondary mb-1.5">{t("settingsPage.typeCol")}</label>
                    <select value={newCompany.kind} onChange={(e) => setNewCompany({ ...newCompany, kind: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                      <option value="FLEET">{t("settingsPage.kindFleet")}</option>
                      <option value="VENDOR">{t("settingsPage.kindVendor")}</option>
                    </select>
                  </div>
                  <button onClick={handleAddCompany}
                    className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors">
                    {t("settingsPage.addCompany")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "users" && <UsersTab />}

      {tab === "notifications" && <NotificationsTab />}

      {tab === "profile" && (
        <div className="bg-white rounded-2xl shadow-sm p-6 max-w-lg">
          <h2 className="text-base font-semibold mb-4">{t("settingsPage.yourProfile")}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">{t("settingsPage.name")}</label>
              <input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} dir="auto"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">{t("settingsPage.email")}</label>
              <input value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5">{t("settingsPage.role")}</label>
              <input value={user?.role?.replace("_", " ") || ""} disabled
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50 text-secondary" />
            </div>
            <button onClick={handleUpdateProfile}
              className="px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors">
              {t("settingsPage.saveChanges")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
