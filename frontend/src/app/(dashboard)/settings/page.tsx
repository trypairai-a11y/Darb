"use client";
import { useState, useEffect, useCallback } from "react";
import { useApiGet } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/cn";
import { Plus, X, Shield, UserX, UserCheck, Loader2, Bell, Check, Store } from "lucide-react";
import api from "@/lib/api";
import BackToSetup from "@/components/shared/BackToSetup";
import { useI18n } from "@/i18n/I18nProvider";

// Revision 4 (#11) — ACCOUNT_MANAGER joins the roles a notification rule can
// name. The rules API was already keyed on an arbitrary role string, so the
// column is the whole change on this side.
const ROLES = [
  "ADMIN",
  "OPS_MANAGER",
  "SUPERVISOR",
  "ACCOUNTANT",
  "ACCOUNT_MANAGER",
  "VIEWER",
] as const;

/**
 * Roles an admin can assign. CASH_COLLECTOR is here but not in ROLES above:
 * it is a portal login for the hand-in desk, so it needs to be creatable
 * without adding a column to a violation-notifications matrix it has no
 * reason to appear in.
 */
const ASSIGNABLE_ROLES = [...ROLES, "CASH_COLLECTOR"] as const;

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-50 text-red-600",
  OPS_MANAGER: "bg-blue-50 text-blue-600",
  SUPERVISOR: "bg-purple-50 text-purple-600",
  ACCOUNTANT: "bg-green-50 text-green-600",
  ACCOUNT_MANAGER: "bg-teal-50 text-teal-600",
  CASH_COLLECTOR: "bg-amber-50 text-amber-600",
  VIEWER: "bg-gray-100 text-gray-500",
};

/** Roles that can own a company as its Darb account manager (revision #20). */
const INTERNAL_ROLES = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"];

type Tab = "companies" | "users" | "notifications" | "profile";

function UsersTab() {
  const { data, refetch } = useApiGet<any>("/api/users?limit=100");
  const users = data?.data || [];
  const [showInvite, setShowInvite] = useState(false);
  // Revision 4 (#12): no password field. The admin never sets anyone's
  // credential; the invited person chooses their own from a link that expires.
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "VIEWER", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  /** Set after a successful invite; the modal switches to showing the link. */
  const [issued, setIssued] = useState<{
    email: string;
    inviteUrl: string;
    inviteExpiresAt: string;
    emailSent: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [permissionsFor, setPermissionsFor] = useState<{ id: string; name: string; role: string } | null>(null);

  function closeInvite() {
    setShowInvite(false);
    setIssued(null);
    setCopied(false);
    setError(null);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post("/api/users", inviteForm);
      // The link is shown whether or not the email left the building, so
      // invites work today by copy-paste and start arriving by email the
      // moment a provider key is configured.
      setIssued({
        email: data.email,
        inviteUrl: data.inviteUrl,
        inviteExpiresAt: data.inviteExpiresAt,
        emailSent: !!data.emailSent,
      });
      setInviteForm({ name: "", email: "", role: "VIEWER", phone: "" });
      refetch();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function copyInviteLink() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Select the link and copy it by hand.");
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
                    {ASSIGNABLE_ROLES.map((r) => (
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
                    onClick={() => setPermissionsFor({ id: u.id, name: u.name, role: u.role })}
                    className="p-1.5 rounded-lg text-secondary hover:bg-gray-50 hover:text-primary transition-colors"
                    title="Permissions"
                  >
                    <Shield size={14} />
                  </button>
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
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeInvite}>
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">{issued ? "Invite sent" : "Invite User"}</h2>
              <button onClick={closeInvite} className="p-1 hover:bg-gray-50 rounded-lg"><X size={18} /></button>
            </div>

            {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm">{error}</div>}

            {issued ? (
              <div className="space-y-4">
                <p className="text-sm text-secondary">
                  {issued.emailSent
                    ? `We emailed ${issued.email} a link to choose their password.`
                    : `No email provider is configured yet, so send ${issued.email} this link yourself.`}
                </p>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Invite link</label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      dir="ltr"
                      value={issued.inviteUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      type="button"
                      onClick={copyInviteLink}
                      className="px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors whitespace-nowrap"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-secondary mt-2">
                    Works once, and stops working on{" "}
                    {new Date(issued.inviteExpiresAt).toLocaleString()}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeInvite}
                  className="w-full px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
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
              <p className="text-xs text-secondary">
                They choose their own password from a link we send. You never set one.
              </p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeInvite}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-50">
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {submitting ? "Sending..." : "Send invite"}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}

      {permissionsFor && (
        <PermissionsModal
          user={permissionsFor}
          onClose={() => setPermissionsFor(null)}
        />
      )}
    </div>
  );
}


/* ── Per-user permissions (revision 4 #12) ── */
//
// The client asked for "a page for restrictions for each user, what he can
// view or change, and for account managers, what companies they are handling".
//
// A surface here is a screen, not an API route, because a screen is what a
// person can name. Every cell starts on "Role default" rather than a copy of
// the role's answer: the difference between "this user inherits ACCOUNTANT"
// and "someone chose EDIT for this user" is the thing an audit needs to see,
// and flattening it on first open would destroy it.
//
// The rail hides what is set to No access, but the server enforces the same
// map via requireSurface, so this is a real restriction and not a hidden menu.

const SURFACE_LABELS: Record<string, string> = {
  LIVE: "Live",
  ORDERS: "Orders",
  MONEY: "Money",
  SETUP: "Setup",
  TODAY: "Today",
  CASH_DESK: "Cash desk",
  PEOPLE: "People and access",
};

const LEVELS = [
  { value: "", label: "Role default" },
  { value: "NONE", label: "No access" },
  { value: "VIEW", label: "View" },
  { value: "EDIT", label: "View and edit" },
];

interface PermissionsPayload {
  surfaces: string[];
  role: string;
  defaults: Record<string, string>;
  overrides: Record<string, string>;
  effective: Record<string, string>;
  managedVendorIds: string[];
}

function PermissionsModal({
  user,
  onClose,
}: {
  user: { id: string; name: string; role: string };
  onClose: () => void;
}) {
  const { data, loading, refetch } = useApiGet<PermissionsPayload>(
    `/api/users/${user.id}/permissions`
  );
  const { data: vendorsData } = useApiGet<any>(
    user.role === "ACCOUNT_MANAGER" ? "/api/vendors?limit=200" : null
  );

  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [vendorIds, setVendorIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!data || seeded) return;
    setOverrides(data.overrides ?? {});
    setVendorIds(data.managedVendorIds ?? []);
    setSeeded(true);
  }, [data, seeded]);

  const vendors: any[] = vendorsData?.data ?? [];

  function setLevel(surface: string, value: string) {
    setOverrides((prev) => {
      const next = { ...prev };
      if (value === "") delete next[surface];
      else next[surface] = value;
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Surfaces the user cleared must be sent as null, not omitted, or the
      // server has no way to tell "put this back on the role default" apart
      // from "leave it alone".
      const payload: Record<string, string | null> = {};
      for (const surface of data?.surfaces ?? []) {
        payload[surface] = overrides[surface] ?? null;
      }
      await api.put(`/api/users/${user.id}/permissions`, {
        overrides: payload,
        ...(user.role === "ACCOUNT_MANAGER" ? { managedVendorIds: vendorIds } : {}),
      });
      refetch();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-lg w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-semibold">Permissions</h2>
            <p className="text-xs text-secondary mt-0.5">
              {user.name} · {user.role.replace("_", " ")}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-50 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mx-6 mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-sm">{error}</div>
        )}

        <div className="flex-1 overflow-y-auto px-6 space-y-5">
          {loading || !data ? (
            <div className="py-10 flex justify-center">
              <Loader2 size={18} className="animate-spin text-secondary" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {data.surfaces.map((surface) => {
                  const chosen = overrides[surface] ?? "";
                  const inherited = data.defaults[surface];
                  return (
                    <div key={surface} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {SURFACE_LABELS[surface] ?? surface}
                        </div>
                        {chosen === "" && (
                          <div className="text-xs text-secondary">
                            Inherits {LEVELS.find((l) => l.value === inherited)?.label ?? inherited}
                          </div>
                        )}
                      </div>
                      <select
                        value={chosen}
                        onChange={(e) => setLevel(surface, e.target.value)}
                        className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {LEVELS.map((l) => (
                          <option key={l.value} value={l.value}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {user.role === "ACCOUNT_MANAGER" && (
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2 mb-2 mt-4">
                    <Store size={14} className="text-secondary" />
                    <span className="text-sm font-medium">Account manager for</span>
                  </div>
                  <p className="text-xs text-secondary mb-3">
                    The merchants this person is responsible for.
                  </p>
                  <div className="space-y-1 max-h-56 overflow-y-auto">
                    {vendors.length === 0 && (
                      <p className="text-xs text-secondary">n/a</p>
                    )}
                    {vendors.map((v: any) => (
                      <label
                        key={v.id}
                        className="flex items-center gap-2 text-sm py-1 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={vendorIds.includes(v.id)}
                          onChange={(e) =>
                            setVendorIds((prev) =>
                              e.target.checked
                                ? [...prev, v.id]
                                : prev.filter((id) => id !== v.id)
                            )
                          }
                          className="rounded border-gray-300"
                        />
                        <span>{v.name}</span>
                        <span className="text-xs text-secondary font-mono">{v.code}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 p-6 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
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
  const [newCompany, setNewCompany] = useState({ name: "", kind: "FLEET", accountManagerId: "" });
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
      const { accountManagerId, ...rest } = newCompany;
      // Unassigned means the field is absent, not an empty string: the create
      // schema types accountManagerId as a uuid and would reject "".
      await api.post("/api/companies", {
        ...rest,
        ...(accountManagerId ? { accountManagerId } : {}),
      });
      setShowAddCompany(false);
      setNewCompany({ name: "", kind: "FLEET", accountManagerId: "" });
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
                  <div>
                    <label className="block text-xs font-medium text-secondary mb-1.5">{t("settingsPage.accountManagerCol")}</label>
                    <select value={newCompany.accountManagerId} onChange={(e) => setNewCompany({ ...newCompany, accountManagerId: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                      <option value="">{t("settingsPage.unassigned")}</option>
                      {staff.map((u: any) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
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
