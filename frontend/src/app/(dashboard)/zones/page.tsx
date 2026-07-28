"use client";
// Darb 2.0 — /zones: two-pane zone management. Zone list on the left,
// LiveMap with polygons on the right; New/Edit polygon enters the
// click-to-add-vertex editor; metadata saved through a SlidePanel form.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Hexagon } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import SlidePanel from "@/components/shared/SlidePanel";
import ConfirmModal from "@/components/shared/ConfirmModal";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import LiveMap from "@/components/map/LiveMap";
import { zoneColor, zoneRingLatLngs } from "@/components/map/zoneGeometry";
import { zonesApi, unwrapList } from "@/lib/darbApi";
import type { DeliveryZone, GeoJsonPolygon } from "@/types/darb";
import BackToSetup from "@/components/shared/BackToSetup";
import { useI18n } from "@/i18n/I18nProvider";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

interface ZoneFormState {
  id: string | null;
  code: string;
  name: string;
  nameAr: string;
  color: string;
  isActive: boolean;
  /** Closed GeoJSON ring ([lng,lat], first === last). */
  ring: number[][] | null;
}

const EMPTY_FORM: ZoneFormState = {
  id: null,
  code: "",
  name: "",
  nameAr: "",
  color: "#1D4E89",
  isActive: true,
  ring: null,
};

function zoneToUnclosedLatLngRing(zone: DeliveryZone): [number, number][] {
  const ring = zoneRingLatLngs(zone);
  if (ring.length >= 2) {
    const [f, l] = [ring[0], ring[ring.length - 1]];
    if (f[0] === l[0] && f[1] === l[1]) return ring.slice(0, -1);
  }
  return ring;
}

export default function ZonesPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { canManageSettings } = useRole();
  const queryClient = useQueryClient();

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<{ zone: DeliveryZone | null } | null>(null);
  const [form, setForm] = useState<ZoneFormState | null>(null);
  const [deleting, setDeleting] = useState<DeliveryZone | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["darb", "zones"],
    queryFn: () => zonesApi.listAll(),
  });
  const zones = useMemo(() => unwrapList<DeliveryZone>(data), [data]);

  // The list dot used to hardcode a green fallback while the map fell back to
  // the palette, so a zone's swatch and its polygon disagreed. Both resolve
  // through zoneColor now.
  const colorById = useMemo(
    () => Object.fromEntries(zones.map((z, i) => [z.id, zoneColor(z, i)])),
    [zones]
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["darb", "zones"] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => zonesApi.remove(id),
    onSuccess: () => {
      toast.success(t("zonesPage.zoneDeleted"));
      setDeleting(null);
      setSelectedZoneId(null);
      invalidate();
    },
    onError: () => toast.error(t("toast.failedSave")),
  });

  function startDrawNew() {
    setForm(null);
    setDrawing({ zone: null });
  }

  /**
   * Revision 5 (#3). Identical to startDrawNew apart from which zone the
   * finished ring lands on: redrawing a boundary is drawing a boundary. The old
   * shape is only a ghost to trace, and nothing is written until Save.
   */
  function startEditPolygon(zone: DeliveryZone) {
    setForm(null);
    setDrawing({ zone });
  }

  function openForm(zone: DeliveryZone | null, ring: number[][] | null) {
    setForm(
      zone
        ? {
            id: zone.id,
            code: zone.code,
            name: zone.name,
            nameAr: zone.nameAr ?? "",
            // Show the colour the map is actually drawing, not a green default.
            color: zone.color ?? colorById[zone.id] ?? "#1D4E89",
            isActive: zone.isActive !== false,
            ring: ring ?? zone.polygon?.coordinates?.[0] ?? null,
          }
        : { ...EMPTY_FORM, ring }
    );
  }

  function handleEditorComplete(ring: number[][]) {
    const zone = drawing?.zone ?? null;
    setDrawing(null);
    openForm(zone, ring);
  }

  async function handleSave() {
    if (!form || !form.code.trim() || !form.name.trim()) return;

    const hasRing = !!form.ring && form.ring.length >= 4;
    // A new zone has nothing to save without a drawn boundary. An existing one
    // can be renamed or recoloured on its own, so a missing ring only blocks
    // creation — it used to return silently here for both, which is what read
    // as "zone edits do not save".
    if (!form.id && !hasRing) {
      toast.error(t("zonesPage.drawBoundaryFirst"));
      return;
    }

    setSaving(true);
    const body: Partial<DeliveryZone> = {
      code: form.code.trim(),
      name: form.name.trim(),
      nameAr: form.nameAr.trim() || null,
      color: form.color,
      isActive: form.isActive,
    };
    if (hasRing) {
      body.polygon = { type: "Polygon", coordinates: [form.ring!] } as GeoJsonPolygon;
    }
    try {
      if (form.id) {
        await zonesApi.update(form.id, body);
      } else {
        await zonesApi.create(body);
      }
      toast.success(t("zonesPage.zoneSaved"));
      setForm(null);
      await invalidate();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;
  const fitBounds = selectedZone ? zoneRingLatLngs(selectedZone) : null;

  // Revision 5 (#3). Edit used to hand the existing ring to the editor as a
  // starting shape and let staff drag its corners, which is the flow that kept
  // snapping back. The client's own answer was to stop editing shapes and start
  // drawing them: Edit is now a fresh draw with the old boundary shown faint
  // underneath to trace. Nothing is destroyed until the redraw is saved, and
  // Cancel leaves the zone exactly as it was.
  const editorGhostRing = drawing?.zone ? zoneToUnclosedLatLngRing(drawing.zone) : null;
  const mapZones = drawing?.zone ? zones.filter((z) => z.id !== drawing.zone?.id) : zones;

  const columns = [
    {
      key: "code",
      label: t("zonesPage.code"),
      render: (v: string, row: DeliveryZone) => (
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: colorById[row.id] ?? "#1D4E89" }}
            aria-hidden="true"
          />
          <span className="font-mono text-xs">{v}</span>
        </span>
      ),
    },
    {
      key: "name",
      label: t("table.name"),
      render: (v: string, row: DeliveryZone) => (
        <div className="min-w-0">
          <p className="truncate">{v}</p>
          {row.nameAr && (
            <p dir="rtl" className="text-xs text-sand-600 truncate">
              {row.nameAr}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "isActive",
      label: t("table.status"),
      render: (v: boolean) => (
        <span
          className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium",
            v !== false ? "bg-green-50 text-green-700" : "bg-sand-200 text-sand-700"
          )}
        >
          {v !== false ? t("status.active") : t("status.inactive")}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      render: (_: unknown, row: DeliveryZone) =>
        canManageSettings ? (
          <div className="flex items-center gap-1 justify-end">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openForm(row, null);
              }}
              className="p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-sand-100 transition-colors"
              aria-label={t("zonesPage.editZone")}
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
              aria-label={t("zonesPage.deleteZone")}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        ) : null,
    },
  ];

  if (isLoading) return <PageSkeleton statCards={0} tableRows={6} tableCols={3} />;
  if (error) {
    return <ErrorState error={error instanceof Error ? error.message : t("errors.loadingData")} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <BackToSetup />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-sm text-sand-900">{t("zonesPage.title")}</h1>
          <p className="text-sm text-sand-600 mt-1">{t("zonesPage.subtitle")}</p>
        </div>
        {canManageSettings && (
          <button
            type="button"
            onClick={startDrawNew}
            disabled={!!drawing}
            className="btn-primary inline-flex items-center gap-2 px-4 h-10 disabled:opacity-50"
          >
            <Plus size={15} aria-hidden="true" />
            {t("zonesPage.newZone")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-6 items-start">
        {/* Zone list */}
        <div>
          <DataTable
            columns={columns}
            data={zones}
            onRowClick={(row: DeliveryZone) => setSelectedZoneId(row.id)}
            emptyMessage={
              <span className="inline-flex items-center gap-2">
                <Hexagon size={14} aria-hidden="true" />
                {t("zonesPage.noZones")}
              </span>
            }
          />
        </div>

        {/* Map */}
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
          <LiveMap
            height="620px"
            zones={mapZones}
            zoneFillOpacity={0.15}
            selectedZoneId={selectedZoneId}
            onZoneClick={(id) => setSelectedZoneId(id)}
            fitBounds={drawing ? null : fitBounds}
            editor={
              drawing
                ? {
                    initialRing: null,
                    ghostRing: editorGhostRing,
                    color: drawing.zone?.color ?? "#1D4E89",
                    onComplete: handleEditorComplete,
                    onCancel: () => setDrawing(null),
                  }
                : null
            }
          />
        </div>
      </div>

      {/* Zone form */}
      <SlidePanel
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? t("zonesPage.editZone") : t("zonesPage.newZone")}
        subtitle={t("zonesPage.title")}
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
                {t("zonesPage.code")}
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                {t("zonesPage.nameEn")}
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
                {t("zonesPage.nameAr")}
              </label>
              <input
                type="text"
                dir="rtl"
                value={form.nameAr}
                onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
                  {t("zonesPage.color")}
                </label>
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-10 w-16 rounded-lg border border-sand-300 bg-white cursor-pointer"
                />
              </div>
              <label className="flex items-center gap-2 mt-5 text-sm text-sand-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border-sand-400 text-primary focus:ring-primary/30"
                />
                {t("zonesPage.active")}
              </label>
            </div>

            {form.id && (
              <button
                type="button"
                onClick={() => {
                  const zone = zones.find((z) => z.id === form.id);
                  if (zone) startEditPolygon(zone);
                }}
                className="inline-flex items-center gap-1.5 px-3 h-9 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/15 rounded-pill transition-colors"
              >
                <Hexagon size={13} aria-hidden="true" />
                {t("zonesPage.editPolygon")}
              </button>
            )}

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
                disabled={saving || (!form.id && (!form.ring || form.ring.length < 4))}
                className="btn-primary px-5 h-10 disabled:opacity-50"
              >
                {saving ? t("common.processing") : t("zonesPage.saveZone")}
              </button>
            </div>
          </form>
        )}
      </SlidePanel>

      <ConfirmModal
        open={!!deleting}
        title={t("zonesPage.deleteConfirmTitle")}
        message={t("zonesPage.deleteConfirmMessage")}
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
