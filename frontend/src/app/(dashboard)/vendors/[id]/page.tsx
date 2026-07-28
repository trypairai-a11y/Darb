"use client";
// Darb 2.0 — /vendors/[id]: vendor detail with tabs
// Profile / Branches (CRUD + map pin picker) / Foodics / Wallet / Users.
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, MapPin, Plus, Pencil, Trash2 } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import SlidePanel from "@/components/shared/SlidePanel";
import ConfirmModal from "@/components/shared/ConfirmModal";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import WalletLedgerTable from "@/components/darb/WalletLedgerTable";
import LiveMap from "@/components/map/LiveMap";
import { vendorsApi, foodicsApi, unwrapList } from "@/lib/darbApi";
import type {
  Vendor,
  VendorBranch,
  VendorPortalRole,
  VendorUser,
  WalletEntry,
} from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd, formatDateTime } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { DirectionalIcon } from "@/i18n/directionalIcon";

type Tab = "profile" | "branches" | "foodics" | "wallet" | "users";

const KUWAIT_CENTER: [number, number] = [29.3759, 47.9774];

interface BranchFormState {
  id: string | null;
  name: string;
  address: string;
  phone: string;
  lat: string;
  lng: string;
}

export default function VendorDetailPage() {
  const params = useParams<{ id: string }>();
  const vendorId = params?.id;
  const router = useRouter();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("profile");

  const vendorQuery = useQuery({
    queryKey: ["darb", "vendor", vendorId],
    queryFn: () => vendorsApi.getById(vendorId),
    enabled: !!vendorId,
  });
  const vendor = vendorQuery.data ?? null;

  const invalidateVendor = () =>
    queryClient.invalidateQueries({ queryKey: ["darb", "vendor", vendorId] });

  if (vendorQuery.isLoading) return <PageSkeleton statCards={0} tableRows={6} tableCols={4} />;
  if (vendorQuery.error || !vendor) {
    return (
      <ErrorState
        error={
          vendorQuery.error instanceof Error ? vendorQuery.error.message : t("errors.notFound")
        }
        onRetry={() => vendorQuery.refetch()}
      />
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: t("vendorsPage.profile") },
    { key: "branches", label: t("vendorsPage.branches") },
    { key: "foodics", label: t("vendorsPage.foodics") },
    { key: "wallet", label: t("vendorsPage.wallet") },
    { key: "users", label: t("vendorsPage.users") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.push("/vendors")}
            className="inline-flex items-center gap-1 text-xs text-sand-600 hover:text-sand-900 transition-colors mb-1"
          >
            <DirectionalIcon kind="chevron-back" size={12} aria-hidden="true" />
            {t("vendorsPage.title")}
          </button>
          <h1 className="font-display text-display-sm text-sand-900 truncate">{vendor.name}</h1>
          <p className="text-sm text-sand-600 mt-0.5">
            <span className="font-mono text-xs">{vendor.code}</span>
            {vendor.nameAr && (
              <span dir="rtl" className="ms-2">
                {vendor.nameAr}
              </span>
            )}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center px-3 py-1 rounded-pill text-xs font-medium",
            vendor.isPaused
              ? "bg-amber-50 text-amber-700"
              : vendor.isActive !== false
                ? "bg-green-50 text-green-700"
                : "bg-sand-200 text-sand-700"
          )}
        >
          {vendor.isPaused
            ? t("vendorsPage.paused")
            : vendor.isActive !== false
              ? t("vendorsPage.active")
              : t("status.inactive")}
        </span>
      </div>

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
        <ProfileTab vendor={vendor} onSaved={invalidateVendor} />
      )}
      {tab === "branches" && <BranchesTab vendorId={vendor.id} />}
      {tab === "foodics" && <FoodicsTab vendorId={vendor.id} />}
      {tab === "wallet" && <WalletTab vendorId={vendor.id} />}
      {tab === "users" && <UsersTab vendorId={vendor.id} />}
    </div>
  );
}

/* ── Profile ── */

function ProfileTab({ vendor, onSaved }: { vendor: Vendor; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({
    name: vendor.name,
    nameAr: vendor.nameAr ?? "",
    phone: vendor.phone ?? "",
    requiresCarOnly: !!vendor.requiresCarOnly,
    isActive: vendor.isActive !== false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      name: vendor.name,
      nameAr: vendor.nameAr ?? "",
      phone: vendor.phone ?? "",
      requiresCarOnly: !!vendor.requiresCarOnly,
      isActive: vendor.isActive !== false,
    });
  }, [vendor]);

  async function handleSave() {
    setSaving(true);
    try {
      await vendorsApi.update(vendor.id, {
        name: form.name.trim(),
        nameAr: form.nameAr.trim() || null,
        phone: form.phone.trim() || null,
        requiresCarOnly: form.requiresCarOnly,
        isActive: form.isActive,
      });
      toast.success(t("vendorsPage.vendorSaved"));
      onSaved();
    } catch {
      toast.error(t("toast.failedSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6 max-w-xl">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        <div>
          <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
            {t("vendorsPage.name")}
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
            {t("vendorsPage.nameAr")}
          </label>
          <input
            type="text"
            dir="rtl"
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-sand-800 cursor-pointer">
            <input
              type="checkbox"
              checked={form.requiresCarOnly}
              onChange={(e) => setForm({ ...form, requiresCarOnly: e.target.checked })}
              className="h-4 w-4 rounded border-sand-400 text-primary focus:ring-primary/30"
            />
            {t("vendorsPage.requiresCarOnly")}
          </label>
          <label className="flex items-center gap-2 text-sm text-sand-800 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="h-4 w-4 rounded border-sand-400 text-primary focus:ring-primary/30"
            />
            {t("vendorsPage.active")}
          </label>
        </div>
        <div className="pt-2">
          <button type="submit" disabled={saving} className="btn-primary px-5 h-10 disabled:opacity-50">
            {saving ? t("common.processing") : t("vendorsPage.saveProfile")}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Branches ── */

function BranchesTab({ vendorId }: { vendorId: string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BranchFormState | null>(null);
  const [deleting, setDeleting] = useState<VendorBranch | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const branchesQuery = useQuery({
    queryKey: ["darb", "vendor", vendorId, "branches"],
    queryFn: () => vendorsApi.listBranches(vendorId),
  });
  const branches = useMemo(() => unwrapList<VendorBranch>(branchesQuery.data), [branchesQuery.data]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["darb", "vendor", vendorId, "branches"] });

  const lat = form ? Number(form.lat) : NaN;
  const lng = form ? Number(form.lng) : NaN;
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);

  async function handleSave() {
    if (!form || !form.name.trim() || !hasPin) return;
    setSaving(true);
    const body = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      lat: Number(form.lat),
      lng: Number(form.lng),
    } as Partial<VendorBranch>;
    try {
      if (form.id) {
        await vendorsApi.updateBranch(vendorId, form.id, body);
      } else {
        await vendorsApi.createBranch(vendorId, body);
      }
      toast.success(t("vendorsPage.branchSaved"));
      setForm(null);
      invalidate();
    } catch {
      toast.error(t("toast.failedSave"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await vendorsApi.removeBranch(vendorId, deleting.id);
      toast.success(t("vendorsPage.branchDeleted"));
      setDeleting(null);
      invalidate();
    } catch {
      toast.error(t("toast.failedSave"));
    } finally {
      setDeletingBusy(false);
    }
  }

  const columns = [
    { key: "name", label: t("vendorsPage.branchName") },
    {
      key: "address",
      label: t("vendorsPage.address"),
      render: (v: string | null) => (v ? <span dir="auto">{v}</span> : <span className="text-sand-400">—</span>),
    },
    {
      // Revision 4 (#8). The column the form has always been able to fill.
      // Dispatch calls a branch when an order stalls at pickup, and the number
      // was only visible by opening the edit panel one branch at a time.
      key: "phone",
      label: t("vendorsPage.phone"),
      render: (v: string | null) =>
        v ? (
          <a
            href={`tel:${v}`}
            dir="ltr"
            className="font-mono text-xs text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {v}
          </a>
        ) : (
          <span className="text-sand-400">n/a</span>
        ),
    },
    {
      key: "zone",
      label: t("vendorsPage.zone"),
      sortable: false,
      render: (zone: VendorBranch["zone"]) =>
        zone ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium bg-primary/10 text-primary">
            {locale === "ar" && zone.nameAr ? zone.nameAr : zone.name}
          </span>
        ) : (
          <span className="text-sand-400">—</span>
        ),
    },
    {
      key: "lat",
      label: `${t("vendorsPage.latitude")} / ${t("vendorsPage.longitude")}`,
      sortable: false,
      render: (_: unknown, row: VendorBranch) => (
        <span dir="ltr" className="font-mono text-xs text-sand-700">
          {Number(row.lat).toFixed(5)}, {Number(row.lng).toFixed(5)}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      render: (_: unknown, row: VendorBranch) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setForm({
                id: row.id,
                name: row.name,
                address: row.address ?? "",
                phone: row.phone ?? "",
                lat: String(row.lat ?? ""),
                lng: String(row.lng ?? ""),
              });
            }}
            className="p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-sand-100 transition-colors"
            aria-label={t("vendorsPage.editBranch")}
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDeleting(row);
            }}
            className="p-1.5 rounded-lg text-secondary hover:text-red-600 hover:bg-red-50 transition-colors"
            aria-label={t("vendorsPage.deleteBranch")}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() =>
            setForm({ id: null, name: "", address: "", phone: "", lat: "", lng: "" })
          }
          className="btn-primary inline-flex items-center gap-2 px-4 h-10"
        >
          <Plus size={15} aria-hidden="true" />
          {t("vendorsPage.addBranch")}
        </button>
      </div>

      <DataTable
        columns={columns}
        data={branches}
        loading={branchesQuery.isLoading}
        emptyMessage={t("vendorsPage.noBranches")}
      />

      <SlidePanel
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? t("vendorsPage.editBranch") : t("vendorsPage.addBranch")}
        subtitle={t("vendorsPage.branches")}
      >
        {form && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
          >
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("vendorsPage.branchName")}
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("vendorsPage.address")}
              </label>
              <input
                type="text"
                dir="auto"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                  {t("vendorsPage.latitude")}
                </label>
                <input
                  type="number"
                  step="any"
                  dir="ltr"
                  value={form.lat}
                  onChange={(e) => setForm({ ...form, lat: e.target.value })}
                  className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                  {t("vendorsPage.longitude")}
                </label>
                <input
                  type="number"
                  step="any"
                  dir="ltr"
                  value={form.lng}
                  onChange={(e) => setForm({ ...form, lng: e.target.value })}
                  className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
            </div>

            <div>
              <p className="flex items-center gap-1.5 text-xs text-sand-600 mb-2">
                <MapPin size={12} aria-hidden="true" />
                {t("vendorsPage.pickOnMap")}
              </p>
              <div className="rounded-xl overflow-hidden border border-sand-200">
                <LiveMap
                  height="220px"
                  center={hasPin ? [lat, lng] : KUWAIT_CENTER}
                  zoom={hasPin ? 14 : 11}
                  marker={hasPin ? { lat, lng } : null}
                  onMapClick={(clickLat, clickLng) =>
                    setForm((prev) =>
                      prev ? { ...prev, lat: clickLat.toFixed(7), lng: clickLng.toFixed(7) } : prev
                    )
                  }
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="px-4 h-10 text-sm font-medium text-sand-800 bg-sand-100 hover:bg-sand-200 rounded-pill transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={saving || !hasPin}
                className="btn-primary px-5 h-10 disabled:opacity-50"
              >
                {saving ? t("common.processing") : t("common.save")}
              </button>
            </div>
          </form>
        )}
      </SlidePanel>

      <ConfirmModal
        open={!!deleting}
        title={t("vendorsPage.deleteBranchConfirmTitle")}
        message={t("vendorsPage.deleteBranchConfirmMessage")}
        variant="danger"
        loading={deletingBusy}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

/* ── Foodics ── */

function FoodicsTab({ vendorId }: { vendorId: string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [connecting, setConnecting] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["darb", "foodics", vendorId],
    queryFn: () => foodicsApi.status({ vendorId }),
    retry: false,
  });
  const status = statusQuery.data;
  const connected =
    status?.connected === true || String(status?.status ?? "").toUpperCase() === "CONNECTED";

  async function handleConnect() {
    setConnecting(true);
    try {
      const { authUrl } = await foodicsApi.connect({ vendorId });
      if (authUrl) {
        window.location.href = authUrl;
        return;
      }
      toast.error(t("foodics.error"));
    } catch {
      toast.error(t("foodics.error"));
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6 max-w-xl space-y-5">
      <div>
        <h2 className="font-medium text-sand-900">{t("foodics.title")}</h2>
        <p className="text-xs text-sand-600 mt-1">{t("foodics.connectHint")}</p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-sand-600 mb-1">{t("foodics.status")}</p>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-pill text-xs font-medium",
              connected ? "bg-green-50 text-green-700" : "bg-sand-200 text-sand-700"
            )}
          >
            <span
              className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-green-600" : "bg-sand-500")}
              aria-hidden="true"
            />
            {connected ? t("foodics.connected") : t("foodics.notConnected")}
          </span>
          {status?.lastEventAt && (
            <p className="text-xs text-sand-600 mt-2">
              {t("foodics.lastEvent")}:{" "}
              <span dir="ltr">{formatDateTime(status.lastEventAt, locale)}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleConnect()}
          disabled={connecting}
          className="btn-primary inline-flex items-center gap-2 px-4 h-10 disabled:opacity-50"
        >
          <ExternalLink size={14} aria-hidden="true" />
          {connecting ? t("common.processing") : t("foodics.connect")}
        </button>
      </div>

      {status?.branchMap && status.branchMap.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-sand-600 mb-2">{t("foodics.branchMap")}</p>
          <div className="border border-sand-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-100/60">
                  <th className="text-start px-4 py-2 text-xs font-medium text-sand-700">
                    {t("foodics.foodicsBranch")}
                  </th>
                  <th className="text-start px-4 py-2 text-xs font-medium text-sand-700">
                    {t("foodics.darbBranch")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {status.branchMap.map((row) => (
                  <tr key={row.foodicsBranchId} className="border-b border-sand-200 last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{row.name ?? row.foodicsBranchId}</td>
                    <td className="px-4 py-2 text-xs">
                      {row.branchId ?? <span className="text-sand-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Wallet ── */

function WalletTab({ vendorId }: { vendorId: string }) {
  const { t, locale } = useI18n();
  const walletQuery = useQuery({
    queryKey: ["darb", "vendor", vendorId, "wallet"],
    queryFn: () => vendorsApi.wallet(vendorId),
  });
  const wallet = walletQuery.data;
  const entries: WalletEntry[] = useMemo(() => unwrapList<WalletEntry>(wallet?.entries), [wallet]);
  const balance = wallet?.account?.balanceKwd ?? wallet?.balanceKwd;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-5 max-w-xs">
        <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-sand-600 mb-2">
          {t("wallet.balance")}
        </p>
        <p dir="ltr" className="font-display text-3xl text-sand-900 tabular-nums">
          {balance != null ? formatKwd(balance, locale) : "—"}
        </p>
      </div>
      <WalletLedgerTable
        entries={entries}
        loading={walletQuery.isLoading}
        exportFilename={`vendor-wallet-${vendorId}`}
      />
    </div>
  );
}

/* ── Users ── */

function UsersTab({ vendorId }: { vendorId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    // Revision 4 (#9). The User model has always had the column and the users
    // list has always shown it; the create form was the one place that could
    // not fill it, so every portal login arrived without a number.
    phone: "",
    vendorRole: "OWNER" as VendorPortalRole,
    branchId: "",
  });
  const [saving, setSaving] = useState(false);

  const usersQuery = useQuery({
    queryKey: ["darb", "vendor", vendorId, "users"],
    queryFn: () => vendorsApi.users(vendorId),
  });
  const users = useMemo(() => unwrapList<VendorUser>(usersQuery.data), [usersQuery.data]);

  // Branch options come from the same source as the Branches tab.
  const branchesQuery = useQuery({
    queryKey: ["darb", "vendor", vendorId, "branches"],
    queryFn: () => vendorsApi.listBranches(vendorId),
  });
  const branches = useMemo(() => unwrapList<VendorBranch>(branchesQuery.data), [branchesQuery.data]);

  // Only an order-tracking login is pinned to one branch; owner and finance
  // are vendor-wide, so the branch picker is irrelevant for them.
  const needsBranch = form.vendorRole === "ORDER_TRACKING";

  const roleLabel = (role: VendorPortalRole | null | undefined) =>
    role === "FINANCE"
      ? t("vendorsPage.roleFinance")
      : role === "ORDER_TRACKING"
        ? t("vendorsPage.roleOrderTracking")
        : t("vendorsPage.roleOwner");

  async function handleCreate() {
    if (!form.name.trim() || !form.email.trim() || !form.password) return;
    if (needsBranch && !form.branchId) {
      toast.error(t("vendorsPage.branchRequired"));
      return;
    }
    setSaving(true);
    try {
      await vendorsApi.createUser(vendorId, {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        vendorRole: form.vendorRole,
        branchId: needsBranch ? form.branchId : null,
      });
      toast.success(t("vendorsPage.userCreated"));
      setForm({
        name: "",
        email: "",
        password: "",
        phone: "",
        vendorRole: "OWNER",
        branchId: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["darb", "vendor", vendorId, "users"] });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Existing users — the tab used to be a bare create form with no way to
          see who already had access. */}
      <div>
        <h2 className="font-medium text-sand-900 mb-3">{t("vendorsPage.users")}</h2>
        <DataTable
          columns={[
            { key: "name", label: t("vendorsPage.userName") },
            {
              key: "email",
              label: t("vendorsPage.userEmail"),
              render: (v: string) => (
                <span dir="ltr" className="font-mono text-xs">
                  {v}
                </span>
              ),
            },
            {
              key: "vendorRole",
              label: t("vendorsPage.portalRole"),
              render: (v: VendorPortalRole | null) => (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium bg-sand-100 text-sand-700">
                  {roleLabel(v)}
                </span>
              ),
            },
            {
              key: "branch",
              label: t("vendorsPage.branch"),
              sortable: false,
              render: (v: VendorUser["branch"]) =>
                v ? (
                  <span dir="auto">{v.name}</span>
                ) : (
                  <span className="text-sand-500">{t("vendorsPage.allBranches")}</span>
                ),
            },
          ]}
          data={users}
          loading={usersQuery.isLoading}
          emptyMessage={t("vendorsPage.noUsers")}
        />
      </div>

      {/* Create */}
      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6 max-w-xl space-y-5">
        <div>
          <h2 className="font-medium text-sand-900">{t("vendorsPage.createUser")}</h2>
          <p className="text-xs text-sand-600 mt-1">{t("vendorsPage.usersHint")}</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("vendorsPage.userName")}
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
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
                placeholder={t("settingsPage.phonePlaceholder")}
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("vendorsPage.userEmail")}
              </label>
              <input
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("vendorsPage.userPassword")}
              </label>
              <input
                type="password"
                dir="ltr"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
                minLength={8}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("vendorsPage.portalRole")}
              </label>
              <select
                value={form.vendorRole}
                onChange={(e) =>
                  setForm({ ...form, vendorRole: e.target.value as VendorPortalRole })
                }
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="OWNER">{t("vendorsPage.roleOwner")}</option>
                <option value="FINANCE">{t("vendorsPage.roleFinance")}</option>
                <option value="ORDER_TRACKING">{t("vendorsPage.roleOrderTracking")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("vendorsPage.branch")}
              </label>
              <select
                value={form.branchId}
                onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                disabled={!needsBranch}
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-sand-100 disabled:text-sand-500"
              >
                <option value="">
                  {needsBranch ? t("vendorsPage.selectBranch") : t("vendorsPage.allBranches")}
                </option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs text-sand-600">{t("vendorsPage.roleHint")}</p>

          <button type="submit" disabled={saving} className="btn-primary px-5 h-10 disabled:opacity-50">
            {saving ? t("common.processing") : t("vendorsPage.createUser")}
          </button>
        </form>
      </div>
    </div>
  );
}
