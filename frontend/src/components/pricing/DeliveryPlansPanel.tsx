"use client";
// Darb 2.0 — delivery plans (revision 4 #7).
//
// Pricing used to be one tenant-wide rate card. The client wants named,
// reusable plans they assign per merchant, and a second kind that prices on
// distance: "12 km and less = this price, 12.1 to 14 = this price, 14+ = this
// price".
//
// A plan is by zone or by kilometre, never both. That is a deliberate limit:
// a plan that could do either is a plan nobody can read off a screen and say
// what a delivery costs.
//
// Blank means unserviceable in both editors, which is the rule the surcharge
// grid already taught this team.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2, Wand2 } from "lucide-react";
import SlidePanel from "@/components/shared/SlidePanel";
import ConfirmModal from "@/components/shared/ConfirmModal";
import { useToast } from "@/components/shared/Toast";
import { deliveryPlansApi, zonesApi, unwrapList } from "@/lib/darbApi";
import type {
  DeliveryPlan,
  DeliveryPlanKmTier,
  DeliveryPlanType,
  DeliveryPlanZoneRate,
  DeliveryZone,
} from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";

const keyOf = (originId: string, destId: string) => `${originId}:${destId}`;

/**
 * Straight-line kilometres between two zone centres. Null when either zone
 * has no centroid, which is the signal to leave that cell alone rather than
 * price it off a guess.
 */
function haversineKm(a: DeliveryZone, b: DeliveryZone): number | null {
  const lat1 = Number(a.centroidLat);
  const lng1 = Number(a.centroidLng);
  const lat2 = Number(b.centroidLat);
  const lng2 = Number(b.centroidLng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toFixed3(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(3) : "";
}

export default function DeliveryPlansPanel() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<DeliveryPlan | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<DeliveryPlanType>("ZONE");
  const [deleting, setDeleting] = useState<DeliveryPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const plansQuery = useQuery({
    queryKey: ["darb", "delivery-plans"],
    queryFn: () => deliveryPlansApi.list({ limit: 100 }),
  });
  const plans = useMemo(() => unwrapList<DeliveryPlan>(plansQuery.data), [plansQuery.data]);

  const zonesQuery = useQuery({ queryKey: ["darb", "zones"], queryFn: () => zonesApi.listAll() });
  const zones = useMemo(
    () => unwrapList<DeliveryZone>(zonesQuery.data).filter((z) => z.isActive !== false),
    [zonesQuery.data]
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["darb", "delivery-plans"] });

  async function handleCreate() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const plan = await deliveryPlansApi.create({ name: newName.trim(), type: newType });
      toast.success(t("plansPage.created"));
      setCreating(false);
      setNewName("");
      await invalidate();
      // Straight into the editor: a plan with no rates prices nothing, so
      // creating one and stopping is never what anybody meant.
      setEditing(plan);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deliveryPlansApi.remove(deleting.id);
      toast.success(t("plansPage.deleted"));
      setDeleting(null);
      await invalidate();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const typeLabel = (type: DeliveryPlanType) =>
    type === "KM" ? t("plansPage.typeKm") : t("plansPage.typeZone");

  return (
    <div className="bg-card border border-sand-200 rounded-2xl shadow-soft overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-medium text-sand-900">{t("plansPage.title")}</h2>
          <p className="text-xs text-sand-600 mt-1">{t("plansPage.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="btn-primary inline-flex items-center gap-2 px-4 h-9 text-sm"
        >
          <Plus size={14} aria-hidden="true" />
          {t("plansPage.newPlan")}
        </button>
      </div>

      <div className="border-t border-sand-200">
        {plansQuery.isLoading ? (
          <p className="px-5 py-6 text-sm text-sand-600">{t("common.loading")}</p>
        ) : plans.length === 0 ? (
          <p className="px-5 py-6 text-sm text-sand-600">{t("plansPage.noPlans")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-50">
                <th className="text-start text-xs font-medium text-sand-600 px-5 py-2">
                  {t("plansPage.planName")}
                </th>
                <th className="text-start text-xs font-medium text-sand-600 px-5 py-2">
                  {t("plansPage.planType")}
                </th>
                <th className="text-start text-xs font-medium text-sand-600 px-5 py-2">
                  {t("plansPage.vendorsOn")}
                </th>
                <th className="text-start text-xs font-medium text-sand-600 px-5 py-2">
                  {t("table.status")}
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr
                  key={plan.id}
                  className="border-t border-sand-100 hover:bg-sand-50 cursor-pointer"
                  onClick={() => setEditing(plan)}
                >
                  <td className="px-5 py-2.5 font-medium text-sand-900">
                    <span dir="auto">{plan.name}</span>
                  </td>
                  <td className="px-5 py-2.5 text-sand-700">{typeLabel(plan.type)}</td>
                  <td className="px-5 py-2.5 text-sand-700 tabular-nums">{plan.vendorCount}</td>
                  <td className="px-5 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-medium",
                        plan.isActive
                          ? "bg-green-50 text-green-700"
                          : "bg-sand-200 text-sand-700"
                      )}
                    >
                      {plan.isActive ? t("vendorsPage.active") : t("status.inactive")}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleting(plan);
                      }}
                      className="p-1.5 rounded-lg text-secondary hover:text-red-600 hover:bg-red-50 transition-colors"
                      aria-label={t("common.delete")}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create */}
      <SlidePanel
        open={creating}
        onClose={() => setCreating(false)}
        title={t("plansPage.newPlan")}
        subtitle={t("plansPage.title")}
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
              {t("plansPage.planName")}
            </label>
            <input
              type="text"
              dir="auto"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("plansPage.planNamePlaceholder")}
              className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              {t("plansPage.planType")}
            </label>
            <div className="space-y-2">
              {(["ZONE", "KM"] as DeliveryPlanType[]).map((type) => (
                <label
                  key={type}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                    newType === type
                      ? "border-primary bg-primary/5"
                      : "border-sand-300 hover:bg-sand-50"
                  )}
                >
                  <input
                    type="radio"
                    name="planType"
                    checked={newType === type}
                    onChange={() => setNewType(type)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium text-sand-900">
                      {typeLabel(type)}
                    </span>
                    <span className="block text-xs text-sand-600 mt-0.5">
                      {type === "ZONE" ? t("plansPage.typeZoneHint") : t("plansPage.typeKmHint")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-sand-600 mt-2">{t("plansPage.typeLockedHint")}</p>
          </div>
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="btn-primary w-full h-10 disabled:opacity-50"
          >
            {busy ? t("common.processing") : t("plansPage.createAndEdit")}
          </button>
        </form>
      </SlidePanel>

      {/* Edit rates */}
      <SlidePanel
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.name ?? ""}
        subtitle={editing ? typeLabel(editing.type) : undefined}
        wide
      >
        {editing && (
          <PlanRatesEditor
            planId={editing.id}
            zones={zones}
            locale={locale}
            onSaved={() => {
              void invalidate();
              setEditing(null);
            }}
          />
        )}
      </SlidePanel>

      <ConfirmModal
        open={!!deleting}
        title={t("plansPage.deletePlan")}
        message={t("plansPage.deleteConfirm")}
        confirmLabel={t("common.delete")}
        variant="danger"
        loading={busy}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

/* ── Rate editors ── */

function PlanRatesEditor({
  planId,
  zones,
  locale,
  onSaved,
}: {
  planId: string;
  zones: DeliveryZone[];
  locale: string;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();

  // Always refetched: the list endpoint carries km tiers but not the zone
  // grid, and a grid editor seeded from a partial plan would silently wipe
  // every cell it never saw on the first save.
  const planQuery = useQuery({
    queryKey: ["darb", "delivery-plan", planId],
    queryFn: () => deliveryPlansApi.getById(planId),
  });
  const plan = planQuery.data;

  const [cells, setCells] = useState<Record<string, string>>({});
  const [tiers, setTiers] = useState<DeliveryPlanKmTier[]>([]);
  // Revision 5 (#7) — this plan's own intra-zone flat fee.
  const [intraFee, setIntraFee] = useState("");
  const [saving, setSaving] = useState(false);
  // Bulk-fill knobs. Defaults are a plain starting point, not a house rate.
  const [fillBase, setFillBase] = useState("1.000");
  const [fillPerKm, setFillPerKm] = useState("0.100");

  useEffect(() => {
    if (!plan) return;
    if (plan.type === "ZONE") {
      const next: Record<string, string> = {};
      for (const rate of plan.zoneRates ?? []) {
        next[keyOf(rate.originZoneId, rate.destZoneId)] = toFixed3(rate.feeKwd);
      }
      setCells(next);
      setIntraFee(plan.intraZoneFeeKwd == null ? "" : toFixed3(plan.intraZoneFeeKwd));
    } else {
      setTiers(
        plan.kmTiers?.length
          ? plan.kmTiers
          : // A fresh km plan opens on the client's own worked example, so the
            // shape of the answer is obvious before anything is typed.
            [
              { maxKm: 12, feeKwd: null },
              { maxKm: 14, feeKwd: null },
              { maxKm: null, feeKwd: null },
            ]
      );
    }
  }, [plan]);

  const zoneLabel = (z: DeliveryZone) => (locale === "ar" && z.nameAr ? z.nameAr : z.name);

  // Counted here rather than read off the plan so it moves as cells are typed.
  // A blank still means unserviceable, but an unserviceable pair should be a
  // decision somebody made, not one they never noticed making.
  const unpriced = useMemo(() => {
    if (!plan || plan.type !== "ZONE") return 0;
    let blank = 0;
    for (const origin of zones) {
      for (const dest of zones) {
        if (origin.id === dest.id) continue;
        const raw = cells[keyOf(origin.id, dest.id)];
        if (raw == null || raw === "" || !Number.isFinite(Number(raw))) blank += 1;
      }
    }
    return blank;
  }, [plan, zones, cells]);

  /**
   * Fill every blank cell from the distance between the two zones.
   *
   * Kuwait is 29 zones, so a by-zone grid is 812 cells. Nobody types 812
   * numbers, and the cells they give up on are the ones that refuse orders
   * later. This lays down a defensible starting price everywhere — base fare
   * plus a per-kilometre rate on the straight line between zone centres,
   * rounded to the nearest 250 fils the way the rest of the rate card is —
   * and leaves it on screen for review. Nothing is saved until Save is
   * pressed, and a cell somebody already typed is never touched.
   */
  function fillBlanksByDistance() {
    const base = Number(fillBase);
    const perKm = Number(fillPerKm);
    if (!Number.isFinite(base) || !Number.isFinite(perKm)) return;

    setCells((prev) => {
      const next = { ...prev };
      let filled = 0;
      for (const origin of zones) {
        for (const dest of zones) {
          if (origin.id === dest.id) continue;
          const k = keyOf(origin.id, dest.id);
          const cur = next[k];
          if (cur != null && cur !== "" && Number.isFinite(Number(cur))) continue;
          const km = haversineKm(origin, dest);
          if (km == null) continue;
          const raw = base + perKm * km;
          next[k] = (Math.round(raw * 4) / 4).toFixed(3); // nearest 250 fils
          filled += 1;
        }
      }
      if (filled > 0) toast.success(t("plansPage.filledCells").replace("{count}", String(filled)));
      return next;
    });
  }

  async function handleSave() {
    if (!plan) return;
    setSaving(true);
    try {
      if (plan.type === "ZONE") {
        // Revision 5 (#7): the flat fee is part of the plan, so it saves with
        // it. Blank clears it, which drops same-zone pricing back onto the
        // grid's diagonal rather than leaving a stale number behind.
        await deliveryPlansApi.update(plan.id, {
          intraZoneFeeKwd:
            intraFee !== "" && Number.isFinite(Number(intraFee))
              ? Number(intraFee).toFixed(3)
              : null,
        });
        const zoneRates: DeliveryPlanZoneRate[] = [];
        for (const origin of zones) {
          for (const dest of zones) {
            const raw = cells[keyOf(origin.id, dest.id)];
            // Blank means unserviceable: no row, which is exactly how the
            // pricing service reads a missing pair.
            if (raw != null && raw !== "" && Number.isFinite(Number(raw))) {
              zoneRates.push({
                originZoneId: origin.id,
                destZoneId: dest.id,
                feeKwd: Number(raw).toFixed(3),
              });
            }
          }
        }
        await deliveryPlansApi.putRates(plan.id, { zoneRates });
      } else {
        await deliveryPlansApi.putRates(plan.id, {
          kmTiers: tiers.map((tier) => ({
            maxKm: tier.maxKm == null ? null : Number(tier.maxKm),
            feeKwd:
              tier.feeKwd == null || tier.feeKwd === ""
                ? null
                : Number(tier.feeKwd).toFixed(3),
          })),
        });
      }
      toast.success(t("pricingPage.saved"));
      onSaved();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (planQuery.isLoading || !plan) {
    return <p className="text-sm text-sand-600">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-sand-600">
        {plan.type === "ZONE" ? t("plansPage.zoneEditorHint") : t("plansPage.kmEditorHint")}
      </p>

      {/* Revision 5 (#7): "whenever we create a plan, the intra-zone flat fee
          will be with each plan". It used to be one tenant-wide number every
          zone plan shared. It sits above the grid because it is the price most
          deliveries actually pay. */}
      {plan.type === "ZONE" && (
        <div className="rounded-xl border border-sand-200 bg-sand-50/60 p-4">
          <label className="block text-xs font-medium text-sand-700 uppercase tracking-wide mb-1.5">
            {t("pricingPage.intraZoneFee")}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-sand-600">KD</span>
            <input
              type="number"
              step="0.001"
              min="0"
              dir="ltr"
              value={intraFee}
              placeholder="—"
              onChange={(e) => setIntraFee(e.target.value)}
              onBlur={(e) => {
                const raw = e.target.value;
                if (raw !== "" && Number.isFinite(Number(raw))) {
                  setIntraFee(Number(raw).toFixed(3));
                }
              }}
              className="w-32 px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-sand-400"
            />
          </div>
          <p className="text-xs text-sand-600 mt-2">{t("plansPage.planIntraZoneHint")}</p>
        </div>
      )}

      {/* A plan with blank cells refuses those orders at intake, and the person
          who finds out is a supervisor staring at a Needs review row days
          later. Say it here, while the grid is open. */}
      {plan.type === "ZONE" && unpriced > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            {t("plansPage.unpricedPairs").replace("{count}", String(unpriced))}
          </p>
          <p className="text-xs text-amber-800 mt-1">{t("plansPage.unpricedPairsHint")}</p>

          <div className="mt-3 pt-3 border-t border-amber-300/70">
            <p className="text-xs font-medium text-amber-900 mb-2">
              {t("plansPage.fillByDistance")}
            </p>
            <div className="flex items-end gap-2 flex-wrap">
              <label className="block">
                <span className="block text-[11px] text-amber-800 mb-1">
                  {t("plansPage.fillBase")}
                </span>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  dir="ltr"
                  value={fillBase}
                  onChange={(e) => setFillBase(e.target.value)}
                  className="w-24 px-2 h-9 rounded-lg bg-white border border-amber-300 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] text-amber-800 mb-1">
                  {t("plansPage.fillPerKm")}
                </span>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  dir="ltr"
                  value={fillPerKm}
                  onChange={(e) => setFillPerKm(e.target.value)}
                  className="w-24 px-2 h-9 rounded-lg bg-white border border-amber-300 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <button
                type="button"
                onClick={fillBlanksByDistance}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-pill bg-amber-900 text-white text-xs font-medium hover:bg-amber-800 transition-colors"
              >
                <Wand2 size={13} aria-hidden="true" />
                {t("plansPage.fillBlanks")}
              </button>
            </div>
            <p className="text-[11px] text-amber-800 mt-2">{t("plansPage.fillByDistanceHint")}</p>
          </div>
        </div>
      )}

      {plan.type === "ZONE" ? (
        <div className="overflow-auto max-h-[520px] border border-sand-200 rounded-xl" dir="ltr">
          <table className="border-collapse min-w-max">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-30 bg-sand-100 border-b border-e border-sand-200 px-3 py-2 text-xs font-medium text-sand-700 text-start">
                  {t("pricingPage.origin")} ↓ / {t("pricingPage.destination")} →
                </th>
                {zones.map((dest) => (
                  <th
                    key={dest.id}
                    className="sticky top-0 z-20 bg-sand-100 border-b border-sand-200 px-2 py-2 text-xs font-medium text-sand-700 whitespace-nowrap min-w-[92px]"
                  >
                    {zoneLabel(dest)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zones.map((origin) => (
                <tr key={origin.id}>
                  <th className="sticky left-0 z-10 bg-sand-100 border-e border-b border-sand-200 px-3 py-1.5 text-xs font-medium text-sand-700 whitespace-nowrap text-start">
                    {zoneLabel(origin)}
                  </th>
                  {zones.map((dest) => {
                    // Revision 5 (#7): same-zone is the flat fee above, not a
                    // cell. Two inputs for one price is how they drift apart.
                    if (origin.id === dest.id) {
                      return (
                        <td
                          key={dest.id}
                          className="border-b border-sand-200 bg-sand-100/60 px-2 py-1.5 text-center text-xs text-sand-500 select-none tabular-nums"
                        >
                          {intraFee !== "" ? intraFee : t("pricingPage.sameZone")}
                        </td>
                      );
                    }
                    const k = keyOf(origin.id, dest.id);
                    return (
                      <td key={dest.id} className="border-b border-sand-200 px-1.5 py-1">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          dir="ltr"
                          value={cells[k] ?? ""}
                          placeholder="—"
                          onChange={(e) =>
                            setCells((prev) => ({ ...prev, [k]: e.target.value }))
                          }
                          onBlur={(e) => {
                            const raw = e.target.value;
                            if (raw !== "" && Number.isFinite(Number(raw))) {
                              setCells((prev) => ({ ...prev, [k]: Number(raw).toFixed(3) }));
                            }
                          }}
                          aria-label={`${zoneLabel(origin)} → ${zoneLabel(dest)}`}
                          className="w-[84px] px-2 h-8 rounded-lg border border-sand-200 text-xs text-end tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-sand-400"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <KmTierEditor tiers={tiers} onChange={setTiers} />
      )}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="btn-primary inline-flex items-center gap-2 px-4 h-10 disabled:opacity-50"
      >
        <Save size={15} aria-hidden="true" />
        {saving ? t("common.processing") : t("pricingPage.save")}
      </button>
    </div>
  );
}

function KmTierEditor({
  tiers,
  onChange,
}: {
  tiers: DeliveryPlanKmTier[];
  onChange: (tiers: DeliveryPlanKmTier[]) => void;
}) {
  const { t } = useI18n();

  function update(index: number, patch: Partial<DeliveryPlanKmTier>) {
    onChange(tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-sand-600 px-1">
        <span>{t("plansPage.upToKm")}</span>
        <span>{t("plansPage.priceKwd")}</span>
        <span />
      </div>
      {tiers.map((tier, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <input
            type="number"
            step="0.1"
            min="0"
            dir="ltr"
            value={tier.maxKm ?? ""}
            placeholder={t("plansPage.andAbove")}
            onChange={(e) =>
              update(i, { maxKm: e.target.value === "" ? null : Number(e.target.value) })
            }
            className="px-3 h-9 rounded-xl bg-white border border-sand-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <input
            type="number"
            step="0.001"
            min="0"
            dir="ltr"
            value={tier.feeKwd ?? ""}
            placeholder={t("plansPage.notServed")}
            onChange={(e) => update(i, { feeKwd: e.target.value === "" ? null : e.target.value })}
            className="px-3 h-9 rounded-xl bg-white border border-sand-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={() => onChange(tiers.filter((_, idx) => idx !== i))}
            disabled={tiers.length <= 1}
            className="p-2 rounded-lg text-secondary hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30"
            aria-label={t("common.delete")}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...tiers, { maxKm: null, feeKwd: null }])}
        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-pill bg-sand-100 text-sand-800 text-xs font-medium hover:bg-sand-200 transition-colors"
      >
        <Plus size={12} aria-hidden="true" />
        {t("plansPage.addTier")}
      </button>
      <p className="text-xs text-sand-600 pt-1">{t("plansPage.tierOrderHint")}</p>
    </div>
  );
}
