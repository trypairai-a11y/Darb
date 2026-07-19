"use client";
// Darb 2.0 — /vendors: vendor directory with FilterBar + DataTable and a
// SlidePanel create form. Row click navigates to /vendors/[id].
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import SlidePanel from "@/components/shared/SlidePanel";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import { vendorsApi, unwrapList } from "@/lib/darbApi";
import type { Vendor } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

const EMPTY_FORM = { name: "", nameAr: "", code: "", phone: "", requiresCarOnly: false };

export default function VendorsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { canManageSettings } = useRole();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["darb", "vendors"],
    queryFn: () => vendorsApi.list(),
  });

  const vendors = useMemo(() => {
    let list = unwrapList<Vendor>(data);
    const q = (filters.search ?? "").trim().toLowerCase();
    if (q) {
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.nameAr ?? "").includes(filters.search.trim()) ||
          v.code.toLowerCase().includes(q)
      );
    }
    if (filters.status === "active") list = list.filter((v) => v.isActive !== false);
    if (filters.status === "inactive") list = list.filter((v) => v.isActive === false);
    if (filters.status === "paused") list = list.filter((v) => v.isPaused);
    return list;
  }, [data, filters]);

  async function handleCreate() {
    if (!form.name.trim() || !form.code.trim()) return;
    setSaving(true);
    try {
      const created = await vendorsApi.create({
        name: form.name.trim(),
        nameAr: form.nameAr.trim() || null,
        code: form.code.trim().toUpperCase(),
        phone: form.phone.trim() || null,
        requiresCarOnly: form.requiresCarOnly,
      });
      toast.success(t("vendorsPage.vendorSaved"));
      setCreating(false);
      setForm({ ...EMPTY_FORM });
      await queryClient.invalidateQueries({ queryKey: ["darb", "vendors"] });
      if (created?.id) router.push(`/vendors/${created.id}`);
    } catch {
      toast.error(t("toast.failedSave"));
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      key: "name",
      label: t("vendorsPage.name"),
      render: (v: string, row: Vendor) => (
        <div className="min-w-0">
          <p className="font-medium text-sand-900 truncate">{v}</p>
          {row.nameAr && (
            <p dir="rtl" className="text-xs text-sand-600 truncate">
              {row.nameAr}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "code",
      label: t("vendorsPage.code"),
      render: (v: string) => <span className="font-mono text-xs">{v}</span>,
    },
    {
      key: "phone",
      label: t("vendorsPage.phone"),
      render: (v: string | null) =>
        v ? (
          <span dir="ltr" className="text-sand-800">
            {v}
          </span>
        ) : (
          <span className="text-sand-400">—</span>
        ),
    },
    {
      key: "_count",
      label: t("vendorsPage.branches"),
      sortable: false,
      render: (v: Vendor["_count"], row: Vendor) => (
        <span className="tabular-nums">{v?.branches ?? row.branches?.length ?? 0}</span>
      ),
    },
    {
      key: "isPaused",
      label: t("table.status"),
      render: (paused: boolean, row: Vendor) => (
        <span
          className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium",
            paused
              ? "bg-amber-50 text-amber-700"
              : row.isActive !== false
                ? "bg-green-50 text-green-700"
                : "bg-sand-200 text-sand-700"
          )}
        >
          {paused
            ? t("vendorsPage.paused")
            : row.isActive !== false
              ? t("vendorsPage.active")
              : t("status.inactive")}
        </span>
      ),
    },
  ];

  if (isLoading) return <PageSkeleton statCards={0} tableRows={8} tableCols={5} />;
  if (error) {
    return <ErrorState error={error instanceof Error ? error.message : t("errors.loadingData")} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-sm text-sand-900">{t("vendorsPage.title")}</h1>
          <p className="text-sm text-sand-600 mt-1">{t("vendorsPage.subtitle")}</p>
        </div>
        {canManageSettings && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn-primary inline-flex items-center gap-2 px-4 h-10"
          >
            <Plus size={15} aria-hidden="true" />
            {t("vendorsPage.newVendor")}
          </button>
        )}
      </div>

      <FilterBar
        filters={[
          { key: "search", label: t("common.search"), type: "search" },
          {
            key: "status",
            label: t("table.status"),
            type: "select",
            options: [
              { value: "active", label: t("vendorsPage.active") },
              { value: "paused", label: t("vendorsPage.paused") },
              { value: "inactive", label: t("status.inactive") },
            ],
          },
        ]}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onClear={() => setFilters({})}
      />

      <DataTable
        columns={columns}
        data={vendors}
        onRowClick={(row: Vendor) => router.push(`/vendors/${row.id}`)}
        emptyMessage={t("vendorsPage.noVendors")}
      />

      <SlidePanel
        open={creating}
        onClose={() => setCreating(false)}
        title={t("vendorsPage.newVendor")}
        subtitle={t("vendorsPage.title")}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("vendorsPage.code")}
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-sand-800 cursor-pointer">
            <input
              type="checkbox"
              checked={form.requiresCarOnly}
              onChange={(e) => setForm({ ...form, requiresCarOnly: e.target.checked })}
              className="h-4 w-4 rounded border-sand-400 text-primary focus:ring-primary/30"
            />
            {t("vendorsPage.requiresCarOnly")}
          </label>
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-4 h-10 text-sm font-medium text-sand-800 bg-sand-100 hover:bg-sand-200 rounded-pill transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={saving} className="btn-primary px-5 h-10 disabled:opacity-50">
              {saving ? t("common.processing") : t("vendorsPage.createVendor")}
            </button>
          </div>
        </form>
      </SlidePanel>
    </div>
  );
}
