"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  Phone,
  Radio,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApi";
import { driverTrackingApi, driverTrainingApi } from "@/lib/darbApi";
import { localizedItemName } from "@/lib/equipmentItems";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/components/shared/Toast";
import { useI18n } from "@/i18n/I18nProvider";
import type { TrainingSession } from "@/types/darb";
import type { DriverFileData } from "@/types/driver-file";
import ScoreTrendChart from "@/components/driver-file/ScoreTrendChart";
import AskDarbWhyDrawer from "@/components/driver-file/AskDarbWhyDrawer";
import DriverPrivateShiftToggle from "@/components/privateShifts/DriverPrivateShiftToggle";

const TABS = ["Overview", "Work", "Training", "Money", "Compliance", "Notes"] as const;
type DriverFileTab = (typeof TABS)[number];
const TAB_KEYS: Record<DriverFileTab, string> = {
  Overview: "tabOverview",
  Work: "tabWork",
  Training: "tabTraining",
  Money: "tabMoney",
  Compliance: "tabCompliance",
  Notes: "tabNotes",
};

/**
 * The page's formatters, in the viewer's language. Every component in this
 * file that shows a date, an amount, a status or an empty value calls this
 * (hooks rules: before any early return).
 */
function useDriverFileFormat() {
  const { t, locale } = useI18n();
  const d = (key: string) => t(`driverFile.${key}`);
  const fallback = d("notSet");
  const dateTag = locale === "ar" ? "ar-KW" : "en-GB";

  function formatEnum(value?: string | null) {
    if (!value) return fallback;
    if (locale === "ar") {
      const path = `status.${value.toLowerCase()}`;
      const translated = t(path);
      if (translated !== path) return translated;
    }
    return value
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatDate(value?: string | null) {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return new Intl.DateTimeFormat(dateTag, { day: "2-digit", month: "short", year: "numeric" }).format(date);
  }

  function formatTime(value?: string | null) {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return new Intl.DateTimeFormat(dateTag, { hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function formatMoney(value?: number | null) {
    const amount = Number(value ?? 0).toFixed(3);
    return locale === "ar" ? `${amount} د.ك` : `KD ${amount}`;
  }

  const itemName = (itemType?: string | null) => localizedItemName(t, locale, itemType);

  return { t, locale, d, fallback, formatEnum, formatDate, formatTime, formatMoney, itemName };
}

function memoryText(value: unknown) {
  if (value && typeof value === "object" && "text" in value) {
    return String((value as { text?: unknown }).text ?? "");
  }
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? {});
}

function statusTone(status?: string | null) {
  const normalized = String(status ?? "").toUpperCase();
  if (["ACTIVE", "VALID", "PASS", "SETTLED", "COMPLETED", "APPROVED", "PRESENT", "UP"].includes(normalized)) {
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  }
  if (["EXPIRING", "PENDING", "LATE", "IN_PROGRESS", "UNDER_REVIEW", "PARTIALLY_PAID", "STABLE"].includes(normalized)) {
    return "bg-amber-50 text-amber-700 border-amber-100";
  }
  if (["EXPIRED", "MISSING", "FAIL", "ABSENT", "SUSPENDED", "REJECTED", "DOWN", "PENDING"].includes(normalized)) {
    return "bg-red-50 text-red-700 border-red-100";
  }
  return "bg-sand-100 text-sand-700 border-sand-200";
}

function Pill({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${tone ?? "bg-white text-sand-800 border-sand-200"}`}>
      {children}
    </span>
  );
}

function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-lg border border-sand-200 bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-sand-100 px-5 py-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-lg border border-sand-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-sand-700">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sand-100 text-sand-700">{icon}</div>
      </div>
    </div>
  );
}

function KeyValueGrid({ rows }: { rows: Array<[string, ReactNode]> }) {
  const { fallback } = useDriverFileFormat();
  return (
    <dl className="grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-sand-700">{label}</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{value || fallback}</dd>
        </div>
      ))}
    </dl>
  );
}

function SimpleTable<T>({
  columns,
  rows,
  empty,
}: {
  columns: Array<{ key: string; label: string; render: (row: T) => React.ReactNode }>;
  rows: T[];
  empty: string;
}) {
  if (!rows.length) return <p className="text-sm text-sand-700">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-sand-100 text-xs text-sand-700">
            {columns.map((column) => (
              <th key={column.key} className="whitespace-nowrap px-3 py-2 font-medium">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-sand-100 last:border-0">
              {columns.map((column) => (
                <td key={column.key} className="px-3 py-3 align-top text-foreground">
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScoreBars({ data }: { data: DriverFileData }) {
  const { d, formatEnum } = useDriverFileFormat();
  const score = data.score;
  if (!score) return <p className="text-sm text-sand-700">{d("scorePreparing")}</p>;
  const rows = [
    [d("attendance"), score.attendanceScore],
    [d("delivery"), score.deliveryScore],
    [d("financial"), score.financialScore],
    [d("equipment"), score.equipmentScore],
    [d("platform"), score.platformScore],
  ] as const;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="text-4xl font-semibold text-foreground">{score.compositeScore}</div>
        <div className="pb-1 text-sm text-sand-700">{d("outOf100")}</div>
        <Pill tone={statusTone(score.trend)}>{formatEnum(score.trend)}</Pill>
      </div>
      <div className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between text-xs text-sand-700">
              <span>{label}</span>
              <span>{value}</span>
            </div>
            <div className="h-2 rounded-full bg-sand-100">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <AskDarbWhyDrawer driverId={data.profile.id} preWarmed={data.scoreExplanation} />
    </div>
  );
}

type InventoryItem = DriverFileData["assets"]["inventory"][number];

/** Still with the driver: issued and not handed back. */
function isOutstanding(item: InventoryItem) {
  return item.issued && !item.returnedDate && item.quantity > 0;
}

/**
 * Revision 24 #15 — "the issued equipment must show in the driver profile".
 * The same DriverInventory rows /assets writes when kit is issued, so the two
 * screens cannot disagree. Outstanding items first, returned ones after.
 */
function EquipmentPanel({ items }: { items: InventoryItem[] }) {
  const { d, formatDate, itemName } = useDriverFileFormat();
  const sorted = [...items].sort((a, b) => Number(isOutstanding(b)) - Number(isOutstanding(a)));
  return (
    <Panel title={d("issuedEquipment")}>
      {sorted.length === 0 ? (
        <p className="text-sm text-sand-700">{d("noEquipment")}</p>
      ) : (
        <ul className="divide-y divide-sand-100" data-testid="driver-issued-equipment">
          {sorted.map((item) => {
            const out = isOutstanding(item);
            return (
              <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {itemName(item.itemType)} <span className="text-sand-600">× {item.quantity}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-sand-700">
                    {item.returnedDate
                      ? d("returnedOn").replace("{date}", formatDate(item.returnedDate))
                      : item.issuedDate
                        ? d("issuedOn").replace("{date}", formatDate(item.issuedDate))
                        : d("issueDateMissing")}
                  </p>
                </div>
                <Pill tone={out ? statusTone("VALID") : statusTone("CLOSED")}>{out ? d("withDriver") : d("returned")}</Pill>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/**
 * Revision 24 #16 — "for terminated drivers, there should be a clearance
 * checkbox confirming we received the equipment from them, after which they
 * get finally terminated". Ticking the box and confirming marks every item
 * still out as returned (and back in stock on /assets) and stamps the driver
 * as finally terminated. Server side: POST /api/drivers/:id/termination-clearance.
 */
function TerminationClearancePanel({ data, onCleared }: { data: DriverFileData; onCleared: () => void }) {
  const p = data.profile;
  const toast = useToast();
  const { t, formatDate, itemName } = useDriverFileFormat();
  const tc = (key: string) => t(`terminationClearance.${key}`);
  const { hasRole } = useRole();
  const canClear = hasRole("SUPERVISOR");
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const outstanding = data.assets.inventory.filter(isOutstanding);

  if (!p.terminationPending) {
    return (
      <Panel title={tc("title")}>
        <p className="text-sm text-foreground" data-testid="termination-cleared">
          {tc("clearedBody")}
          {p.terminationClearedAt ? tc("clearedOn").replace("{date}", formatDate(p.terminationClearedAt)) : ""}
          {p.terminationClearedBy ? tc("clearedBy").replace("{name}", p.terminationClearedBy.name) : ""}
          {tc("clearedFinal")}
        </p>
        {p.terminationClearanceNote ? (
          <p className="mt-2 text-sm text-sand-700">{tc("note").replace("{note}", p.terminationClearanceNote)}</p>
        ) : null}
      </Panel>
    );
  }

  async function clear() {
    setBusy(true);
    try {
      await driverTrackingApi.clearTermination(p.id, note.trim() || undefined);
      toast.success(tc("toastCleared"));
      onCleared();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message ?? tc("toastError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-red-200 bg-red-50/40" data-testid="termination-clearance">
      <div className="border-b border-red-100 px-5 py-4">
        <h2 className="text-base font-semibold text-foreground">{tc("title")}</h2>
        <p className="mt-1 text-sm text-sand-700">
          {tc("pendingBody").replace(
            "{on}",
            p.terminatedAt ? tc("pendingOn").replace("{date}", formatDate(p.terminatedAt)) : "",
          )}
        </p>
      </div>
      <div className="space-y-4 p-5">
        {outstanding.length === 0 ? (
          <p className="text-sm text-sand-700">{tc("noneOutstanding")}</p>
        ) : (
          <div>
            <p className="mb-2 text-xs text-sand-700">{tc("stillWithDriver")}</p>
            <ul className="space-y-1">
              {outstanding.map((item) => (
                <li key={item.id} className="text-sm text-foreground">
                  {itemName(item.itemType)} × {item.quantity}
                </li>
              ))}
            </ul>
          </div>
        )}
        {canClear ? (
          <>
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                data-testid="termination-clearance-checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-sand-300 accent-primary"
              />
              <span>
                {outstanding.length ? tc("confirmItems") : tc("confirmNothing")}
              </span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={tc("notePlaceholder")}
              className="w-full rounded-lg border border-sand-200 bg-white p-3 text-sm"
            />
            <button
              type="button"
              data-testid="termination-clearance-confirm"
              disabled={!confirmed || busy}
              onClick={() => void clear()}
              className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? tc("saving") : tc("confirm")}
            </button>
          </>
        ) : (
          <p className="text-sm text-sand-700">{tc("supervisorOnly")}</p>
        )}
      </div>
    </section>
  );
}

function DriverFileSkeleton() {
  return (
    <div className="w-full max-w-none p-6 lg:p-8">
      <div className="animate-pulse space-y-4">
        <div className="h-28 rounded-lg bg-sand-100" />
        <div className="grid gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-24 rounded-lg bg-sand-100" />
          ))}
        </div>
        <div className="h-80 rounded-lg bg-sand-100" />
      </div>
    </div>
  );
}

function ErrorState({ title, message }: { title: string; message?: string }) {
  return (
    <div className="w-full max-w-none p-6 lg:p-8">
      <div className="rounded-lg border border-sand-200 bg-white p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        {message ? <p className="mt-2 text-sm text-sand-700">{message}</p> : null}
      </div>
    </div>
  );
}

export default function DriverFilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, d, fallback, formatEnum, formatDate, formatTime, formatMoney } = useDriverFileFormat();
  // Revision 24 #15: "there is no back button on this page". Back to wherever
  // the user came from; a profile opened from a pasted link goes to Driver
  // tracking, which is where profiles are opened from.
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/ops?tab=driver-tracking");
  };
  const searchParams = useSearchParams();
  const askedTab = searchParams?.get("tab");
  const [tab, setTab] = useState<DriverFileTab>(
    (TABS as readonly string[]).includes(askedTab ?? "") ? (askedTab as DriverFileTab) : "Overview",
  );
  // Client note of 2026-10-05: once a training window is decided it leaves
  // Ops > Driver training, and its score lives here, pass and fail both.
  const trainingQuery = useQuery({
    queryKey: ["darb", "driver-training", "driver", id],
    queryFn: () => driverTrainingApi.list({ driverId: id! }),
    enabled: Boolean(id) && tab === "Training",
  });
  const trainingSessions = useMemo(
    () => (trainingQuery.data?.data ?? []).filter((s) => s.status === "PASSED" || s.status === "FAILED"),
    [trainingQuery.data],
  );
  const { data, isLoading, error } = useApiQuery<DriverFileData>(
    ["driver-file", id ?? ""],
    id ? `/api/drivers/${id}/file` : null,
  );

  const trendPoints = useMemo(() => {
    return (data?.snapshots90d ?? []).map((point) => ({
      snapshotDate: point.snapshotDate.slice(5, 10),
      compositeScore: point.compositeScore,
    }));
  }, [data?.snapshots90d]);

  if (isLoading) return <DriverFileSkeleton />;
  if (error && (error as any).status === 404) return <ErrorState title={d("notFound")} />;
  if (error || !data) return <ErrorState title={d("loadError")} message={(error as any)?.message} />;

  const p = data.profile;
  const initials = p.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const statusLabel =
    p.status === "TERMINATED"
      ? t(p.terminationPending ? "terminationClearance.statusPending" : "terminationClearance.statusTerminated")
      : formatEnum(p.status);

  return (
    <div className="w-full max-w-none space-y-5 p-6 lg:p-8">
      <button
        type="button"
        onClick={goBack}
        data-testid="driver-file-back"
        className="inline-flex items-center gap-1.5 text-sm text-sand-700 hover:text-foreground"
      >
        <ArrowLeft size={15} aria-hidden="true" className="rtl:rotate-180" />
        {d("back")}
      </button>
      <header className="rounded-lg border border-sand-200 bg-white p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-semibold text-white">
              {initials || "D"}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold tracking-normal text-foreground">{p.name}</h1>
                <Pill tone={p.status === "TERMINATED" ? statusTone("REJECTED") : statusTone(p.status)}>{statusLabel}</Pill>
                <Pill>{formatEnum(p.performanceTier)}</Pill>
              </div>
              {/* Revision 24 #14: the legacy aggregator tag ("Talabat") is
                  gone. Darb is the only platform; the field is inherited. */}
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-sand-700">
                <span>{formatEnum(p.vehicleType)}</span>
                <span>{p.zone ?? fallback}</span>
                <span>{p.company?.name ?? fallback}</span>
              </div>
            </div>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[360px]">
            <div className="rounded-lg border border-sand-200 px-3 py-2">
              <div className="text-xs text-sand-700">{d("phone")}</div>
              <div className="mt-1 flex items-center gap-2 font-medium">
                <Phone size={14} aria-hidden="true" />
                {p.phone || fallback}
              </div>
            </div>
            <div className="rounded-lg border border-sand-200 px-3 py-2">
              <div className="text-xs text-sand-700">{d("liveStatus")}</div>
              <div className="mt-1 flex items-center gap-2 font-medium">
                <Radio size={14} aria-hidden="true" />
                {data.liveStatus.onlineNow ? d("onlineNow") : d("offline")}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-5">
        <Metric label={d("score")} value={data.score ? `${data.score.compositeScore}` : fallback} icon={<ShieldCheck size={18} />} />
        <Metric label={d("todayOrders")} value={String(data.orders.todayCount)} icon={<CheckCircle2 size={18} />} />
        <Metric label={d("weekOrders")} value={String(data.orders.weekCount)} icon={<CalendarClock size={18} />} />
        <Metric label={d("cashDue")} value={formatMoney(data.cash.outstanding)} icon={<Wallet size={18} />} />
        <Metric label={d("violations")} value={String(data.violations.items.length)} icon={<FileCheck2 size={18} />} />
      </div>

      {/* Revision 24 (#8): eligible for private shifts. */}
      {id && <DriverPrivateShiftToggle driverId={id} />}

      <nav className="rounded-lg border border-sand-200 bg-white p-1">
        <div className="grid gap-1 sm:grid-cols-6">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                tab === item ? "bg-foreground text-white" : "text-sand-700 hover:bg-sand-100 hover:text-foreground"
              }`}
            >
              {d(TAB_KEYS[item])}
            </button>
          ))}
        </div>
      </nav>

      {p.status === "TERMINATED" && (
        <TerminationClearancePanel
          data={data}
          onCleared={() => void queryClient.invalidateQueries({ queryKey: ["driver-file", id ?? ""] })}
        />
      )}

      {tab === "Overview" && (
        <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <div className="space-y-5">
            <Panel title={d("profile")}>
              <KeyValueGrid
                rows={[
                  [d("driverId"), p.driverCode ?? fallback],
                  [d("company"), p.company?.name ?? fallback],
                  [d("supervisor"), p.supervisor?.name ?? fallback],
                  [d("zone"), p.zone ?? fallback],
                  [d("batch"), p.batchNumber ?? fallback],
                  [d("hireDate"), formatDate(p.hireDate)],
                  [d("avgMonthlySalary"), p.monthlySalary ? formatMoney(p.monthlySalary) : fallback],
                  [d("civilId"), formatEnum(p.civilIdStatus)],
                  [d("civilIdExpiry"), formatDate(p.civilIdExpiry)],
                ]}
              />
            </Panel>
            <Panel title={d("batchHistory")}>
              {data.batchHistory.length ? (
                <SimpleTable
                  rows={data.batchHistory}
                  empty={d("noBatchChanges")}
                  columns={[
                    { key: "batch", label: d("batch"), render: (row) => <Pill>{row.batchNumber ?? fallback}</Pill> },
                    { key: "changedAt", label: d("changed"), render: (row) => formatDate(row.changedAt) },
                  ]}
                />
              ) : (
                <p className="text-sm text-sand-700">
                  {d("currentBatch").split("{batch}")[0]}
                  <span className="font-medium text-foreground">{p.batchNumber ?? fallback}</span>
                  {d("currentBatch").split("{batch}")[1] ?? ""}
                </p>
              )}
            </Panel>
            <Panel title={d("scoreTrend")}>
              <ScoreTrendChart points={trendPoints} />
            </Panel>
          </div>
          <div className="space-y-5">
            <Panel title={d("score")}>
              <ScoreBars data={data} />
            </Panel>
            <EquipmentPanel items={data.assets.inventory} />
          </div>
        </div>
      )}

      {tab === "Work" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title={d("recentShifts")}>
            <SimpleTable
              rows={data.shifts.recent}
              empty={d("noShifts")}
              columns={[
                { key: "date", label: d("date"), render: (row) => formatDate(row.date) },
                { key: "time", label: d("time"), render: (row) => d("timeRange").replace("{start}", formatTime(row.scheduledStart)).replace("{end}", formatTime(row.scheduledEnd)) },
                { key: "zone", label: d("zone"), render: (row) => row.deliveryArea ?? row.zone ?? fallback },
                { key: "status", label: d("status"), render: (row) => <Pill tone={statusTone(row.status)}>{formatEnum(row.status)}</Pill> },
              ]}
            />
          </Panel>
          <Panel title={d("recentOrders")}>
            <SimpleTable
              rows={data.orders.recent}
              empty={d("noOrders")}
              columns={[
                { key: "date", label: d("date"), render: (row) => formatDate(row.date) },
                { key: "restaurant", label: d("restaurant"), render: (row) => row.restaurantName ?? fallback },
                { key: "orders", label: d("orders"), render: (row) => row.orderCount },
                { key: "cash", label: d("cash"), render: (row) => formatMoney(row.cashCollected) },
                { key: "arrival", label: d("arrival"), render: (row) => formatTime(row.arrivalTime) },
              ]}
            />
          </Panel>
        </div>
      )}

      {tab === "Training" && (
        <Panel title={d("trainingSessions")}>
          {trainingQuery.isLoading ? (
            <p className="text-sm text-sand-700">{d("loadingTraining")}</p>
          ) : (
            <SimpleTable<TrainingSession>
              rows={trainingSessions}
              empty={d("noTraining")}
              columns={[
                { key: "ended", label: d("finished"), render: (row) => formatDate(row.completedAt ?? row.endsAt) },
                { key: "period", label: d("period"), render: (row) => d(row.periodDays === 1 ? "oneDay" : "days").replace("{n}", String(row.periodDays)) },
                {
                  key: "result",
                  label: d("result"),
                  render: (row) => (
                    <span data-testid="driver-training-result">
                      <Pill tone={statusTone(row.status === "PASSED" ? "PASS" : "FAIL")}>
                        {row.status === "PASSED" ? d("passed") : d("didNotPass")}
                      </Pill>
                    </span>
                  ),
                },
                {
                  key: "delivered",
                  label: d("delivered"),
                  render: (row) => (row.scorecard ? d("deliveredOf").replace("{delivered}", String(row.scorecard.delivered)).replace("{assigned}", String(row.scorecard.assigned)) : fallback),
                },
                {
                  key: "onTime",
                  label: d("onTime"),
                  render: (row) =>
                    row.scorecard?.onTimeRate == null ? fallback : `${Math.round(row.scorecard.onTimeRate * 100)}%`,
                },
                {
                  key: "minutes",
                  label: d("avgMinutes"),
                  render: (row) => (row.scorecard?.avgMinutes == null ? fallback : String(row.scorecard.avgMinutes)),
                },
                { key: "coach", label: d("coach"), render: (row) => row.coach?.name ?? fallback },
                { key: "note", label: d("note"), render: (row) => row.outcomeNote ?? fallback },
              ]}
            />
          )}
        </Panel>
      )}

      {tab === "Money" && (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <Panel title={d("cashPosition")}>
            <KeyValueGrid
              rows={[
                [d("outstanding"), formatMoney(data.cash.outstanding)],
                [d("todayCash"), formatMoney(data.orders.todayCash)],
                [d("weekCash"), formatMoney(data.orders.weekCash)],
              ]}
            />
          </Panel>
          <Panel title={d("cashRecords")}>
            <SimpleTable
              rows={data.cash.records}
              empty={d("noCashRecords")}
              columns={[
                { key: "date", label: d("date"), render: (row) => formatDate(row.date) },
                { key: "sales", label: d("sales"), render: (row) => formatMoney(row.salesAmount) },
                { key: "collection", label: d("collected"), render: (row) => formatMoney(row.collectionAmount) },
                { key: "pending", label: d("due"), render: (row) => formatMoney(row.pendingDues) },
                { key: "status", label: d("status"), render: (row) => <Pill tone={statusTone(row.status)}>{formatEnum(row.status)}</Pill> },
              ]}
            />
          </Panel>
        </div>
      )}

      {tab === "Compliance" && (
        <div className="space-y-5">
          <Panel title={d("documents")}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {data.documents.map((doc) => (
                <div key={doc.key} className="rounded-lg border border-sand-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{doc.label}</p>
                      <p className="mt-1 text-sm text-sand-700">{formatDate(doc.expiry)}</p>
                    </div>
                    <Pill tone={statusTone(doc.status)}>{formatEnum(doc.status)}</Pill>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title={d("violations")}>
              <SimpleTable
                rows={data.violations.items}
                empty={d("noViolations")}
                columns={[
                  { key: "time", label: d("date"), render: (row) => formatDate(row.violationTime) },
                  { key: "type", label: d("type"), render: (row) => formatEnum(row.violationType) },
                  { key: "status", label: d("status"), render: (row) => <Pill tone={statusTone(row.violationStatus)}>{formatEnum(row.violationStatus)}</Pill> },
                  { key: "appeal", label: d("appeal"), render: (row) => formatEnum(row.appealStatus) },
                ]}
              />
            </Panel>
            <Panel title={d("restrictions")}>
              <SimpleTable
                rows={data.violations.restrictions}
                empty={d("noRestrictions")}
                columns={[
                  { key: "type", label: d("type"), render: (row) => formatEnum(row.type) },
                  { key: "start", label: d("start"), render: (row) => formatDate(row.startDate) },
                  { key: "end", label: d("end"), render: (row) => (row.endDate ? formatDate(row.endDate) : d("permanent")) },
                  { key: "active", label: d("state"), render: (row) => <Pill tone={row.active ? statusTone("PENDING") : statusTone("COMPLETED")}>{row.active ? d("active") : d("closed")}</Pill> },
                ]}
              />
            </Panel>
            <Panel title={d("penalties")}>
              <SimpleTable
                rows={data.violations.penalties}
                empty={d("noPenalties")}
                columns={[
                  { key: "date", label: d("date"), render: (row) => formatDate(row.createdAt) },
                  { key: "type", label: d("type"), render: (row) => formatEnum(row.penaltyType) },
                  { key: "value", label: d("value"), render: (row) => row.penaltyValue ?? fallback },
                  { key: "status", label: d("status"), render: (row) => <Pill tone={statusTone(row.penaltyStatus)}>{formatEnum(row.penaltyStatus)}</Pill> },
                ]}
              />
            </Panel>
            <Panel title={d("tickets")}>
              <SimpleTable
                rows={data.tickets}
                empty={d("noTickets")}
                columns={[
                  { key: "number", label: d("ticket"), render: (row) => row.ticketNumber },
                  { key: "title", label: d("ticketTitle"), render: (row) => row.title },
                  { key: "priority", label: d("priority"), render: (row) => <Pill tone={statusTone(row.priority)}>{formatEnum(row.priority)}</Pill> },
                  { key: "status", label: d("status"), render: (row) => formatEnum(row.status) },
                ]}
              />
            </Panel>
          </div>
        </div>
      )}

      {tab === "Notes" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title={d("agentNotes")}>
            <div className="space-y-3">
              {data.agentNotes.observations.length ? (
                data.agentNotes.observations.map((note) => (
                  <div key={note.id} className="rounded-lg border border-sand-200 p-4">
                    <p className="text-sm font-medium text-foreground">{memoryText(note.value)}</p>
                    <p className="mt-2 text-xs text-sand-700">{formatDate(note.createdAt)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-sand-700">{d("noNotes")}</p>
              )}
            </div>
          </Panel>
          <Panel title={d("recentDecisions")}>
            <div className="space-y-3">
              {data.agentNotes.proposals.concat(data.agentNotes.audit).length ? (
                data.agentNotes.proposals.concat(data.agentNotes.audit).map((item) => (
                  <div key={item.id} className="rounded-lg border border-sand-200 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill>{formatEnum(item.toolName)}</Pill>
                      <span className="text-xs text-sand-700">{formatDate(item.createdAt)}</span>
                    </div>
                    <p className="mt-3 text-sm text-foreground">{item.reasoning}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-sand-700">{d("noDecisions")}</p>
              )}
            </div>
          </Panel>
          <Panel title={d("vehicleCare")}>
            <div className="grid gap-5 lg:grid-cols-2">
              <SimpleTable
                rows={data.assets.inspections}
                empty={d("noInspections")}
                columns={[
                  { key: "date", label: d("date"), render: (row) => formatDate(row.date) },
                  { key: "status", label: d("status"), render: (row) => <Pill tone={statusTone(row.status)}>{formatEnum(row.status)}</Pill> },
                ]}
              />
              <SimpleTable
                rows={data.assets.maintenance}
                empty={d("noMaintenance")}
                columns={[
                  { key: "date", label: d("date"), render: (row) => formatDate(row.createdAt) },
                  { key: "type", label: d("workCol"), render: (row) => row.type },
                  { key: "cost", label: d("cost"), render: (row) => formatMoney(row.cost) },
                ]}
              />
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
