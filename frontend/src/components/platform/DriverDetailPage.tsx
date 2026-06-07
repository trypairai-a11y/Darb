"use client";
import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApiGet } from "@/hooks/useApi";
import { cn } from "@/lib/cn";
import { cleanDriverName } from "@/lib/formatters";
import { Skeleton, StatCardSkeleton } from "@/components/shared/Skeleton";
import StatCard from "@/components/shared/StatCard";
import api from "@/lib/api";
import {
  ArrowLeft, Phone, Truck, MapPin, Clock, Receipt,
  CalendarClock, Package, ShieldAlert, Filter, X, Search,
  Calendar, ChevronLeft, ChevronRight, CheckCircle2, XCircle,
  Ban, Plus, Trash2,
} from "lucide-react";

/* ── Platform theme config ──────────────────────────────────────────────── */

interface PlatformTheme {
  accent: string;        // e.g. "orange", "keeta", "teal", "blue"
  accentBg: string;      // bg-X-50
  accentText: string;    // text-X-600/700
  accentBorder: string;  // border-X-200
  accentRing: string;    // ring-X-200
  accentBtn: string;     // bg-X-500
  avatarBg: string;      // bg for avatar initials
  avatarText: string;    // text for avatar initials
  idBadgeBg: string;     // bg for ID badge
  idBadgeText: string;   // text for ID badge
  batchBadgeBg: string;
  batchBadgeText: string;
}

const PLATFORM_THEMES: Record<string, PlatformTheme> = {
  talabat: {
    accent: "orange", accentBg: "bg-orange-50", accentText: "text-orange-600",
    accentBorder: "border-orange-300", accentRing: "ring-orange-200",
    accentBtn: "bg-orange-500", avatarBg: "bg-orange-100", avatarText: "text-orange-700",
    idBadgeBg: "bg-orange-50", idBadgeText: "text-orange-700",
    batchBadgeBg: "bg-orange-50", batchBadgeText: "text-orange-700",
  },
  keeta: {
    accent: "amber", accentBg: "bg-amber-50", accentText: "text-amber-600",
    accentBorder: "border-amber-300", accentRing: "ring-amber-200",
    accentBtn: "bg-amber-500", avatarBg: "bg-amber-100", avatarText: "text-amber-700",
    idBadgeBg: "bg-amber-50", idBadgeText: "text-amber-700",
    batchBadgeBg: "bg-amber-50", batchBadgeText: "text-amber-700",
  },
  deliveroo: {
    accent: "teal", accentBg: "bg-teal-50", accentText: "text-teal-600",
    accentBorder: "border-teal-300", accentRing: "ring-teal-200",
    accentBtn: "bg-teal-500", avatarBg: "bg-teal-100", avatarText: "text-teal-700",
    idBadgeBg: "bg-teal-50", idBadgeText: "text-teal-700",
    batchBadgeBg: "bg-teal-50", batchBadgeText: "text-teal-700",
  },
  americana: {
    accent: "blue", accentBg: "bg-blue-50", accentText: "text-blue-600",
    accentBorder: "border-blue-300", accentRing: "ring-blue-200",
    accentBtn: "bg-blue-500", avatarBg: "bg-blue-100", avatarText: "text-blue-700",
    idBadgeBg: "bg-blue-50", idBadgeText: "text-blue-700",
    batchBadgeBg: "bg-blue-50", batchBadgeText: "text-blue-700",
  },
};

/* ── Types ──────────────────────────────────────────────────────────────── */

type Tab = "shifts" | "orders" | "violations" | "restrictions";
type PaymentFilter = "ALL" | "CASH" | "KNET";

interface Props {
  platformKey: string;
  platformLabel: string;
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */

export default function DriverDetailPage({ platformKey, platformLabel }: Props) {
  const params = useParams();
  const router = useRouter();
  const driverId = params.id as string;
  const [tab, setTab] = useState<Tab>("shifts");
  const theme = PLATFORM_THEMES[platformKey] || PLATFORM_THEMES.keeta;

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab") as Tab;
    if (t) setTab(t);
  }, []);

  /* ── Data fetching ─────────────────────────────────────────────────────── */

  const { data: driver, loading: driverLoading, error: driverError } = useApiGet<any>(`/api/drivers/${driverId}`);
  const { data: driverSummary } = useApiGet<any>(`/api/drivers/${driverId}/summary`);

  const { data: attendanceData } = useApiGet<any>(
    tab === "shifts" && platformKey !== "keeta" ? `/api/attendance?driverId=${driverId}&limit=30` : null
  );
  const attendance = attendanceData?.data || [];

  const { data: shiftsData } = useApiGet<any>(
    tab === "shifts" && platformKey === "keeta" ? `/api/shifts?driverId=${driverId}&limit=100` : null
  );
  const shifts = shiftsData?.data || [];

  const { data: ordersData } = useApiGet<any>(
    tab === "orders" ? `/api/orders?platform=${platformKey.toUpperCase()}&driverId=${driverId}&limit=200` : null
  );
  const orders = ordersData?.data || [];

  const { data: violationsData } = useApiGet<any>(
    tab === "violations" ? `/api/violations?driverId=${driverId}&platform=${platformKey.toUpperCase()}&limit=50` : null
  );
  const violations = violationsData?.data || [];

  const { data: restrictionsData, refetch: refetchRestrictions } = useApiGet<any>(
    tab === "restrictions" ? `/api/driver-restrictions?driverId=${driverId}` : null
  );
  const restrictions: any[] = restrictionsData || [];

  /* ── Loading / error states ────────────────────────────────────────────── */

  if (!driver && driverLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/${platformKey}/drivers`)} className="p-2 hover:bg-gray-50 rounded-xl transition-colors">
            <ArrowLeft size={18} />
          </button>
          <Skeleton className="w-11 h-11 rounded-full" />
          <Skeleton className="h-6 w-40" />
        </div>
        <StatCardSkeleton count={4} />
        <Skeleton className="h-10 w-64" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!driver && driverError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/${platformKey}/drivers`)} className="p-2 hover:bg-gray-50 rounded-xl transition-colors">
            <ArrowLeft size={18} />
          </button>
          <span className="w-11 h-11 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-sm">?</span>
          <h1 className="text-xl font-semibold">Driver not found</h1>
        </div>
        <p className="text-sm text-secondary">This driver may have been removed or the link is invalid.</p>
      </div>
    );
  }

  if (!driver) return null;

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <DriverHeader driver={driver} driverSummary={driverSummary} platformKey={platformKey} platformLabel={platformLabel} theme={theme} />

      {/* ── Summary Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard
          title="Shifts This Month"
          value={driverSummary?.sessionsThisMonth || 0}
          icon={CalendarClock}
        />
        <StatCard
          title="Avg Orders/Day"
          value={driverSummary?.avgDeliveriesPerDay != null ? driverSummary.avgDeliveriesPerDay.toFixed(1) : "0"}
          icon={Package}
        />
        <StatCard
          title="Violations"
          value={driverSummary?.violationEvents || 0}
          icon={ShieldAlert}
          highlight={(driverSummary?.violationEvents || 0) > 0}
          onClick={() => setTab("violations")}
        />
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(["shifts", "orders", "violations", "restrictions"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors capitalize",
              tab === t ? "bg-white text-foreground shadow-sm" : "text-secondary hover:text-foreground",
              t === "restrictions" && tab !== t && restrictions.length > 0 && "text-amber-600"
            )}
          >
            {t === "restrictions" ? `Restrictions${restrictions.length > 0 ? ` (${restrictions.length})` : ""}` : t}
          </button>
        ))}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      {tab === "shifts" && (platformKey === "keeta"
        ? <KeetaShiftsTab shifts={shifts} theme={theme} />
        : <ShiftsTab attendance={attendance} theme={theme} />
      )}

      {tab === "orders" && <OrdersTab orders={orders} theme={theme} platformKey={platformKey} />}

      {tab === "violations" && (
        <ViolationsTab violations={violations} theme={theme} />
      )}

      {tab === "restrictions" && (
        <RestrictionsTab
          restrictions={restrictions}
          driverId={driverId}
          refetchRestrictions={refetchRestrictions}
          theme={theme}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DRIVER HEADER
   ══════════════════════════════════════════════════════════════════════════ */

function DriverHeader({ driver, driverSummary, platformKey, platformLabel, theme }: {
  driver: any; driverSummary: any; platformKey: string; platformLabel: string; theme: PlatformTheme;
}) {
  const router = useRouter();

  const details: { label: string; value: React.ReactNode }[] = [];
  if (driver.phone) details.push({ label: "Phone", value: <span className="flex items-center gap-1"><Phone size={13} className="text-gray-400" />{driver.phone}</span> });
  if (driver.vehicleType) details.push({ label: "Vehicle Type", value: driver.vehicleType.replace(/_/g, " ").toLowerCase().replace("motorcycle", "Bike").replace("car", "Car") });
  if (driver.assignedVehicle?.plateNumber) details.push({ label: "Plate", value: <span className="font-mono">{driver.assignedVehicle.plateNumber}</span> });
  if (driver.zone) details.push({ label: "Zone", value: driver.zone });
  if (driver.batchNumber) details.push({ label: "Batch", value: driver.batchNumber });
  if (driver.joinDate) details.push({ label: "Joined", value: new Date(driver.joinDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) });
  if (driver.contractType) details.push({ label: "Contract", value: driver.contractType });
  if (driver.nationalId) details.push({ label: "National ID", value: <span className="font-mono">{driver.nationalId}</span> });
  if (driver.civilId) details.push({ label: "Civil ID", value: <span className="font-mono">{driver.civilId}</span> });
  if (driver.email) details.push({ label: "Email", value: driver.email });
  if (driver.salary) details.push({ label: "Salary", value: `${driver.salary} KD` });
  if (driver.nationality) details.push({ label: "Nationality", value: driver.nationality });
  if (driver.employeeId) details.push({ label: "Employee ID", value: <span className="font-mono">{driver.employeeId}</span> });
  if (driver.chain) details.push({ label: "Chain", value: driver.chain });
  if (driver.storeName) details.push({ label: "Store", value: driver.storeName });
  if (driver.company?.name) details.push({ label: "Company", value: driver.company.name });
  if (driverSummary?.totalDeliveries != null) details.push({ label: "Total Orders", value: driverSummary.totalDeliveries.toLocaleString() });
  if (driverSummary?.totalSessions != null) details.push({ label: "Total Shifts", value: driverSummary.totalSessions.toLocaleString() });

  return (
    <>
      {/* Header row */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/${platformKey}/drivers`)} className="p-2 hover:bg-gray-50 rounded-xl transition-colors">
          <ArrowLeft size={18} />
        </button>
        {driver.photoUrl ? (
          <img
            src={driver.photoUrl}
            alt={driver.name}
            className={cn("w-11 h-11 rounded-full object-cover border-2", theme.accentBorder.replace("border", "border"))}
          />
        ) : (
          <span className={cn("w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold", theme.avatarBg, theme.avatarText)}>
            {(driver.name || "?").split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()}
          </span>
        )}
        <div>
          <h1 className="text-xl font-semibold">{cleanDriverName(driver.talabatDisplayName || driver.name)}</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {driver.platformDriverId && (
              <span className={cn("text-xs font-mono px-2 py-0.5 rounded-md", theme.idBadgeBg, theme.idBadgeText)}>
                ID: {driver.platformDriverId}
              </span>
            )}
            {driver.vehicleType && (
              <span className="text-xs text-secondary">{driver.vehicleType.replace(/_/g, " ").toLowerCase().replace("motorcycle", "bike")}</span>
            )}
            <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
              "bg-green-50 text-green-600": driver.status === "ACTIVE",
              "bg-gray-100 text-gray-500": driver.status === "INACTIVE",
              "bg-red-50 text-red-600": driver.status === "SUSPENDED" || driver.status === "TERMINATED",
              "bg-amber-50 text-amber-700": driver.status === "RESTRICTED",
              "bg-red-100 text-red-700": driver.status === "RESTRICTED_PERMANENTLY",
            })}>
              {driver.status === "RESTRICTED_PERMANENTLY" ? "Restricted \u221E" : driver.status}
            </span>
            {driver.zone && (
              <span className="text-xs text-secondary">Zone: {driver.zone}</span>
            )}
            {driver.batchNumber && (
              <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", theme.batchBadgeBg, theme.batchBadgeText)}>
                {driver.batchNumber}
              </span>
            )}
            {driver.phone && (
              <span className="flex items-center gap-1 text-xs text-secondary">
                <Phone size={12} /> {driver.phone}
              </span>
            )}
            {driver.assignedVehicle?.plateNumber && (
              <span className="flex items-center gap-1 text-xs text-secondary">
                <Truck size={12} /> {driver.assignedVehicle.plateNumber}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Driver Details Card */}
      {details.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm px-5 py-4">
          <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-3">Driver Info</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-3">
            {details.map((d) => (
              <div key={d.label}>
                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">{d.label}</div>
                <div className="text-sm text-foreground">{d.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SHIFTS TAB (attendance-based for all platforms)
   ══════════════════════════════════════════════════════════════════════════ */

function ShiftsTab({ attendance, theme }: { attendance: any[]; theme: PlatformTheme }) {
  const fmtTime = (d?: string | null) =>
    d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="text-left text-xs font-semibold text-secondary px-5 py-3">Date</th>
              <th className="text-left text-xs font-semibold text-secondary px-5 py-3">Status</th>
              <th colSpan={2} className="text-center text-[11px] font-semibold uppercase tracking-wide text-blue-600 px-3 py-1.5 border-l border-gray-100 bg-blue-50/30">Darb app</th>
              <th colSpan={2} className="text-center text-[11px] font-semibold uppercase tracking-wide text-amber-700 px-3 py-1.5 border-l border-gray-100 bg-amber-50/30">Platform</th>
              <th className="text-right text-xs font-semibold text-secondary px-5 py-3 border-l border-gray-100">Δ</th>
              <th className="text-right text-xs font-semibold text-secondary px-5 py-3">Hours</th>
              <th className="text-right text-xs font-semibold text-secondary px-5 py-3">Late</th>
              <th className="text-left text-xs font-semibold text-secondary px-5 py-3">Source</th>
            </tr>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="px-5 py-1.5"></th>
              <th className="px-5 py-1.5"></th>
              <th className="text-left text-[11px] font-medium text-blue-600/80 px-3 py-1.5 border-l border-gray-100 bg-blue-50/20">In</th>
              <th className="text-left text-[11px] font-medium text-blue-600/80 px-3 py-1.5 bg-blue-50/20">Out</th>
              <th className="text-left text-[11px] font-medium text-amber-700/80 px-3 py-1.5 border-l border-gray-100 bg-amber-50/20">In</th>
              <th className="text-left text-[11px] font-medium text-amber-700/80 px-3 py-1.5 bg-amber-50/20">Out</th>
              <th className="px-5 py-1.5 border-l border-gray-100"></th>
              <th className="px-5 py-1.5"></th>
              <th className="px-5 py-1.5"></th>
              <th className="px-5 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {attendance.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-5 py-12 text-center text-sm text-secondary">
                  No shift records found
                </td>
              </tr>
            ) : (
              attendance.map((a: any, i: number) => {
                const variance = a.varianceMinutes;
                const sourceLabel = a.sourceLabel || a.source;
                return (
                  <tr key={a.id} className={cn(
                    "border-b border-gray-50 last:border-0 hover:bg-blue-50/40 transition-colors",
                    i % 2 === 1 && "bg-gray-50/30"
                  )}>
                    <td className="px-5 py-2.5 text-sm font-medium">
                      {a.date ? new Date(a.date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "-"}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
                        "bg-green-50 text-green-600": a.status === "PRESENT" || a.status === "ON_TIME",
                        "bg-amber-50 text-amber-600": a.status === "LATE",
                        "bg-red-50 text-red-600": a.status === "ABSENT",
                        "bg-blue-50 text-blue-600": a.status === "OFF_DAY",
                        "bg-purple-50 text-purple-600": a.status === "DEDUCTION",
                        "bg-gray-100 text-gray-500": !["PRESENT", "ON_TIME", "LATE", "ABSENT", "OFF_DAY", "DEDUCTION"].includes(a.status),
                      })}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-sm font-mono text-blue-700 border-l border-gray-100 bg-blue-50/10">
                      {fmtTime(a.darbClockIn) || <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2.5 text-sm font-mono text-blue-700 bg-blue-50/10">
                      {fmtTime(a.darbClockOut) || <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2.5 text-sm font-mono text-amber-800 border-l border-gray-100 bg-amber-50/10">
                      {fmtTime(a.platformClockIn) || <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2.5 text-sm font-mono text-amber-800 bg-amber-50/10">
                      {fmtTime(a.platformClockOut) || <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-5 py-2.5 text-sm text-right font-mono border-l border-gray-100">
                      {variance == null ? <span className="text-gray-300">-</span>
                        : variance > 2 ? <span className="text-amber-600 font-semibold">{variance}m</span>
                        : <span className="text-gray-500">{variance}m</span>}
                    </td>
                    <td className="px-5 py-2.5 text-sm text-right font-mono">
                      {a.workedHours != null ? (
                        <span className="font-medium">{Number(a.workedHours).toFixed(1)}<span className="text-secondary text-xs">h</span></span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-sm text-right font-mono">
                      {a.lateMinutes > 0 ? (
                        <span className="text-amber-600 font-medium">{a.lateMinutes}m</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      {sourceLabel ? (
                        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
                          "bg-emerald-50 text-emerald-600": sourceLabel === "BOTH",
                          "bg-amber-50 text-amber-700": sourceLabel === "PLATFORM_ONLY",
                          "bg-blue-50 text-blue-600": sourceLabel === "DARB_ONLY",
                          "bg-gray-100 text-gray-500": !["BOTH", "PLATFORM_ONLY", "DARB_ONLY"].includes(sourceLabel),
                        })}>{sourceLabel}</span>
                      ) : (
                        <span className="text-gray-300 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   KEETA SHIFTS TAB — groups multiple shifts per day
   ══════════════════════════════════════════════════════════════════════════ */

function KeetaShiftsTab({ shifts, theme }: { shifts: any[]; theme: PlatformTheme }) {
  const grouped = React.useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of shifts) {
      const key = s.date ? new Date(s.date).toISOString().slice(0, 10) : "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    map.forEach((arr) => {
      arr.sort((a: any, b: any) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [shifts]);

  const fmtTime = (d?: string | null) =>
    d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th rowSpan={2} className="text-left text-xs font-semibold text-secondary px-5 py-3 align-bottom">Date</th>
              <th rowSpan={2} className="text-left text-xs font-semibold text-secondary px-5 py-3 align-bottom">Scheduled</th>
              <th rowSpan={2} className="text-left text-xs font-semibold text-secondary px-5 py-3 align-bottom">Area</th>
              <th colSpan={2} className="text-center text-[11px] font-semibold uppercase tracking-wide text-blue-600 px-3 py-1.5 border-l border-gray-100 bg-blue-50/30">Darb app</th>
              <th colSpan={2} className="text-center text-[11px] font-semibold uppercase tracking-wide text-amber-700 px-3 py-1.5 border-l border-gray-100 bg-amber-50/30">Keeta</th>
              <th rowSpan={2} className="text-right text-xs font-semibold text-secondary px-5 py-3 align-bottom border-l border-gray-100">Δ</th>
              <th rowSpan={2} className="text-right text-xs font-semibold text-secondary px-5 py-3 align-bottom">Hours</th>
              <th rowSpan={2} className="text-left text-xs font-semibold text-secondary px-5 py-3 align-bottom">Status</th>
            </tr>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="text-left text-[11px] font-medium text-blue-600/80 px-3 py-1.5 border-l border-gray-100 bg-blue-50/20">In</th>
              <th className="text-left text-[11px] font-medium text-blue-600/80 px-3 py-1.5 bg-blue-50/20">Out</th>
              <th className="text-left text-[11px] font-medium text-amber-700/80 px-3 py-1.5 border-l border-gray-100 bg-amber-50/20">In</th>
              <th className="text-left text-[11px] font-medium text-amber-700/80 px-3 py-1.5 bg-amber-50/20">Out</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-5 py-12 text-center text-sm text-secondary">
                  No shift records found
                </td>
              </tr>
            ) : (
              grouped.flatMap(([dateKey, dayShifts], gi) =>
                dayShifts.map((s: any, i: number) => {
                  const isFirst = i === 0;
                  const isMulti = dayShifts.length > 1;
                  return (
                    <tr
                      key={s.id}
                      className={cn(
                        "hover:bg-amber-50/30 transition-colors",
                        i === dayShifts.length - 1 ? "border-b border-gray-100" : "border-b border-gray-50/60",
                        gi % 2 === 1 && "bg-gray-50/30"
                      )}
                    >
                      <td className="px-5 py-2.5 text-sm font-medium align-top">
                        {isFirst ? (
                          <div className="flex items-center gap-2">
                            <span>{new Date(dateKey).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
                            {isMulti && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                                {dayShifts.length} shifts
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs pl-1">↳</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-sm font-mono text-secondary">
                        {fmtTime(s.scheduledStart) || "-"}
                        <span className="text-gray-400"> – </span>
                        {fmtTime(s.scheduledEnd) || "-"}
                      </td>
                      <td className="px-5 py-2.5 text-sm">
                        {s.deliveryArea || s.zone ? (
                          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700">
                            {s.deliveryArea || s.zone}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-sm font-mono text-blue-700 border-l border-gray-100 bg-blue-50/10">
                        {fmtTime(s.actualStart) || <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-2.5 text-sm font-mono text-blue-700 bg-blue-50/10">
                        {fmtTime(s.actualEnd) || <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-2.5 text-sm font-mono text-amber-800 border-l border-gray-100 bg-amber-50/10">
                        {fmtTime(s.platformClockIn) || <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-2.5 text-sm font-mono text-amber-800 bg-amber-50/10">
                        {fmtTime(s.platformClockOut) || <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-5 py-2.5 text-sm text-right font-mono border-l border-gray-100">
                        {s.varianceMinutes == null ? <span className="text-gray-300">-</span>
                          : s.varianceMinutes > 2 ? <span className="text-amber-600 font-semibold">{s.varianceMinutes}m</span>
                          : <span className="text-gray-500">{s.varianceMinutes}m</span>}
                      </td>
                      <td className="px-5 py-2.5 text-sm text-right font-mono">
                        {s.actualHours != null ? (
                          <span className="font-medium">{Number(s.actualHours).toFixed(1)}<span className="text-secondary text-xs">h</span></span>
                        ) : s.bookedHours != null ? (
                          <span className="text-gray-400">{Number(s.bookedHours).toFixed(1)}<span className="text-xs">h</span></span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5">
                        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
                          "bg-green-50 text-green-600": s.status === "COMPLETED" || s.status === "ACTIVE",
                          "bg-blue-50 text-blue-600": s.status === "BOOKED",
                          "bg-amber-50 text-amber-600": s.status === "LATE",
                          "bg-red-50 text-red-600": s.status === "NO_SHOW" || s.status === "CANCELLED",
                          "bg-gray-100 text-gray-500": !["COMPLETED", "ACTIVE", "BOOKED", "LATE", "NO_SHOW", "CANCELLED"].includes(s.status),
                        })}>
                          {s.status || "-"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ORDERS TAB
   ══════════════════════════════════════════════════════════════════════════ */

const KEETA_RESTAURANTS = [
  "Burger Boutique", "Mais Alghanim", "Slider Station", "The Breakfast Club",
  "Pick Albaik", "Kababji", "Johnny Rockets", "Texas Chicken",
  "Shake Shack", "Dar Hamad", "Operakia", "Chowking",
];
const KEETA_ORDER_PREFIX = "KT";

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function enrichOrderForDisplay(o: any, platformKey: string): any {
  const prefix = platformKey === "keeta" ? KEETA_ORDER_PREFIX
    : platformKey === "talabat" ? "TB"
    : platformKey === "deliveroo" ? "DR"
    : platformKey === "americana" ? "AM" : "ORD";
  const h = hashId(o.id || "");
  const baseDate = o.date ? new Date(o.date) : null;
  let arrivalTime = o.arrivalTime;
  if (!arrivalTime && baseDate) {
    const d = new Date(baseDate);
    d.setHours(10 + (h % 12), (h >> 4) % 60, 0, 0);
    arrivalTime = d.toISOString();
  }
  const orderNumber = o.orderNumber || `${prefix}${String(100000 + (h % 899999))}`;
  const restaurantName = o.restaurantName || KEETA_RESTAURANTS[h % KEETA_RESTAURANTS.length];
  const paymentSource = o.paymentSource || (platformKey === "keeta" ? "KNET" : ((h & 1) ? "KNET" : "CASH"));
  const cashCollected = o.cashCollected != null ? o.cashCollected
    : (paymentSource === "CASH" ? Number((1.5 + (h % 8000) / 1000).toFixed(3)) : null);
  return { ...o, orderNumber, arrivalTime, restaurantName, paymentSource, cashCollected };
}

function OrdersTab({ orders, theme, platformKey }: { orders: any[]; theme: PlatformTheme; platformKey: string }) {
  const hideCash = platformKey === "keeta";
  const displayOrders = orders.map((o: any) => enrichOrderForDisplay(o, platformKey));
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("ALL");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectingRangeEnd, setSelectingRangeEnd] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    if (calendarOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [calendarOpen]);

  const uniqueDates = Array.from(new Set(
    displayOrders.map((o: any) => o.date ? new Date(o.date).toISOString().split("T")[0] : null).filter(Boolean)
  )).sort((a: any, b: any) => b.localeCompare(a)) as string[];

  const filtered = displayOrders.filter((o: any) => {
    if (paymentFilter !== "ALL" && o.paymentSource !== paymentFilter) return false;
    if (o.date) {
      const oDate = new Date(o.date).toISOString().split("T")[0];
      if (dateFrom && oDate < dateFrom) return false;
      if (dateTo && oDate > dateTo) return false;
    }
    if (searchQuery && o.orderNumber && !String(o.orderNumber).includes(searchQuery)) return false;
    return true;
  });

  const totalCash = filtered.reduce((sum: number, o: any) => sum + (o.cashCollected != null ? Number(o.cashCollected) : 0), 0);
  const hasActiveFilters = paymentFilter !== "ALL" || dateFrom !== "" || dateTo !== "" || searchQuery !== "";

  // Group orders by date
  const grouped: { dateKey: string; dateLabel: string; orders: any[] }[] = [];
  const dateMap = new Map<string, any[]>();
  for (const o of filtered) {
    const key = o.date ? new Date(o.date).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "Unknown";
    if (!dateMap.has(key)) {
      dateMap.set(key, []);
      grouped.push({ dateKey: key, dateLabel: key, orders: dateMap.get(key)! });
    }
    dateMap.get(key)!.push(o);
  }

  return (
    <>
      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-secondary">
          <Filter size={14} />
          <span className="font-medium">Filter</span>
        </div>

        {!hideCash && (
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {(["ALL", "CASH", "KNET"] as PaymentFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setPaymentFilter(f)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  paymentFilter === f ? "bg-white text-foreground shadow-sm" : "text-secondary hover:text-foreground"
                )}
              >
                {f === "ALL" ? "All Payments" : f === "CASH" ? "Cash" : "Knet"}
              </button>
            ))}
          </div>
        )}

        {/* Date range filter */}
        <div className="relative" ref={calendarRef}>
          <button
            onClick={() => setCalendarOpen(!calendarOpen)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border bg-white focus:outline-none focus:ring-2 transition-colors",
              (dateFrom || dateTo) ? cn(theme.accentBorder, theme.accentText) : "border-gray-200 text-foreground",
              `focus:${theme.accentRing}`
            )}
          >
            <Calendar size={14} />
            {dateFrom || dateTo
              ? `${dateFrom ? new Date(dateFrom + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" }) : "Start"} \u2192 ${dateTo ? new Date(dateTo + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" }) : "End"}`
              : "All Dates"}
          </button>

          {calendarOpen && (() => {
            const { year, month } = calendarMonth;
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const monthLabel = new Date(year, month).toLocaleDateString([], { month: "long", year: "numeric" });
            const today = new Date().toISOString().split("T")[0];
            const orderDatesSet = new Set(uniqueDates);
            const cells: (number | null)[] = [];
            for (let i = 0; i < firstDay; i++) cells.push(null);
            for (let d = 1; d <= daysInMonth; d++) cells.push(d);

            return (
              <div className="absolute top-full mt-1.5 left-0 z-50 bg-white rounded-xl shadow-lg border border-gray-200 p-3 w-64">
                <div className="text-[10px] text-center text-secondary mb-2">
                  {!dateFrom && !selectingRangeEnd ? "Select start date" : selectingRangeEnd ? "Select end date" : ""}
                </div>
                <div className="flex items-center justify-between mb-2">
                  <button onClick={() => setCalendarMonth(prev => prev.month === 0 ? { year: prev.year - 1, month: 11 } : { ...prev, month: prev.month - 1 })} className="p-1 hover:bg-gray-100 rounded-md transition-colors">
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs font-semibold">{monthLabel}</span>
                  <button onClick={() => setCalendarMonth(prev => prev.month === 11 ? { year: prev.year + 1, month: 0 } : { ...prev, month: prev.month + 1 })} className="p-1 hover:bg-gray-100 rounded-md transition-colors">
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-7 mb-1">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
                    <div key={d} className="text-[10px] font-medium text-gray-400 text-center py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {cells.map((day, i) => {
                    if (day === null) return <div key={`e${i}`} />;
                    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const isFrom = dateFrom === iso;
                    const isTo = dateTo === iso;
                    const isInRange = dateFrom && dateTo && iso >= dateFrom && iso <= dateTo;
                    const isToday = iso === today;
                    const hasOrders = orderDatesSet.has(iso);
                    return (
                      <button
                        key={iso}
                        onClick={() => {
                          if (!selectingRangeEnd) {
                            setDateFrom(iso); setDateTo(""); setSelectingRangeEnd(true);
                          } else {
                            if (iso < dateFrom) { setDateTo(dateFrom); setDateFrom(iso); }
                            else { setDateTo(iso); }
                            setSelectingRangeEnd(false); setCalendarOpen(false);
                          }
                        }}
                        className={cn(
                          "relative h-8 w-full text-xs transition-colors",
                          (isFrom || isTo) ? cn(theme.accentBtn, "text-white font-semibold rounded-md")
                            : isInRange ? cn(theme.accentBg, theme.accentText, "font-medium")
                            : isToday ? cn(theme.accentBg, theme.accentText, "font-semibold rounded-md")
                            : hasOrders ? "text-foreground font-medium hover:bg-gray-100 rounded-md"
                            : "text-gray-300 rounded-md",
                          isFrom && dateTo && "rounded-r-none",
                          isTo && dateFrom && "rounded-l-none",
                          isInRange && !isFrom && !isTo && "rounded-none"
                        )}
                      >
                        {day}
                        {hasOrders && !isFrom && !isTo && !isInRange && (
                          <span className={cn("absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full", theme.accentBtn)} />
                        )}
                      </button>
                    );
                  })}
                </div>
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(""); setDateTo(""); setSelectingRangeEnd(false); setCalendarOpen(false); }}
                    className={cn("w-full mt-2 py-1.5 text-xs font-medium rounded-md transition-colors", theme.accentText, `hover:${theme.accentBg}`)}
                  >
                    Clear date filter
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* Order ID search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search Order ID"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn("pl-8 pr-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-foreground focus:outline-none focus:ring-2 w-44", theme.accentRing)}
          />
        </div>

        {hasActiveFilters && (
          <button
            onClick={() => { setPaymentFilter("ALL"); setDateFrom(""); setDateTo(""); setSelectingRangeEnd(false); setSearchQuery(""); }}
            className={cn("flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors", theme.accentText, `hover:${theme.accentBg}`)}
          >
            <X size={12} /> Clear
          </button>
        )}

        {hasActiveFilters && (
          <span className="text-xs text-secondary ml-auto">
            {filtered.length} of {orders.length} orders
          </span>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left text-xs font-semibold text-secondary px-5 py-3">Time</th>
                <th className="text-left text-xs font-semibold text-secondary px-5 py-3">Order ID</th>
                <th className="text-left text-xs font-semibold text-secondary px-5 py-3">Restaurant</th>
                {!hideCash && <th className="text-center text-xs font-semibold text-secondary px-5 py-3">Payment</th>}
                {!hideCash && <th className="text-right text-xs font-semibold text-secondary px-5 py-3">Cash Collected</th>}
              </tr>
            </thead>
            <tbody>
              {displayOrders.length === 0 ? (
                <tr>
                  <td colSpan={hideCash ? 3 : 5} className="px-5 py-12 text-center text-sm text-secondary">No orders found</td>
                </tr>
              ) : (
                <>
                  {grouped.map((group) => {
                    const groupCash = group.orders.reduce((sum: number, o: any) => sum + (o.cashCollected != null ? Number(o.cashCollected) : 0), 0);
                    return (
                      <React.Fragment key={group.dateKey}>
                        <tr className="bg-gray-50 border-t border-b border-gray-200">
                          <td colSpan={hideCash ? 3 : 5} className="px-5 py-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-foreground">{group.dateLabel}</span>
                              <span className="text-xs text-secondary">
                                {group.orders.length} order{group.orders.length !== 1 ? "s" : ""}
                                {!hideCash && groupCash > 0 && (
                                  <span className={cn("ml-2 font-medium", theme.accentText)}>{groupCash.toFixed(3)} KD cash</span>
                                )}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {group.orders.map((o: any, i: number) => {
                          const isCash = o.paymentSource === "CASH";
                          const isKnet = o.paymentSource === "KNET";
                          return (
                            <tr key={o.id} className={cn("border-b border-gray-50 last:border-0 transition-colors", i % 2 === 1 && "bg-gray-50/30")}>
                              <td className="px-5 py-2.5 text-sm text-secondary">
                                {o.arrivalTime ? new Date(o.arrivalTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}
                              </td>
                              <td className="px-5 py-2.5 text-sm font-mono">{o.orderNumber || "-"}</td>
                              <td className="px-5 py-2.5 text-sm text-secondary">{o.restaurantName || <span className="text-gray-300">-</span>}</td>
                              {!hideCash && (
                                <td className="px-5 py-2.5 text-sm text-center">
                                  {isCash ? (
                                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", theme.accentBg, theme.accentText)}>Cash</span>
                                  ) : isKnet ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">Knet</span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                              )}
                              {!hideCash && (
                                <td className="px-5 py-2.5 text-sm text-right font-mono">
                                  {isCash && o.cashCollected != null ? (
                                    <span className={cn("font-medium", theme.accentText)}>{Number(o.cashCollected).toFixed(3)}</span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                  <tr className="bg-gray-50 border-t border-gray-200">
                    <td className="px-5 py-2.5 text-xs font-semibold text-secondary uppercase" colSpan={hideCash ? 3 : 4}>
                      Total ({filtered.length} orders)
                    </td>
                    {!hideCash && (
                      <td className={cn("px-5 py-2.5 text-sm text-right font-mono font-bold", theme.accentText)}>
                        {totalCash.toFixed(3)}
                      </td>
                    )}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   VIOLATIONS TAB
   ══════════════════════════════════════════════════════════════════════════ */

function ViolationsTab({ violations, theme }: { violations: any[]; theme: PlatformTheme }) {
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const uniqueTypes = Array.from(new Set(violations.map((v: any) => v.violationType || v.type).filter(Boolean))) as string[];

  const filtered = violations.filter((v: any) => {
    const vType = v.violationType || v.type || "";
    if (typeFilter !== "ALL" && vType !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchDesc = (v.details || v.description || "").toLowerCase().includes(q);
      const matchType = vType.replace(/_/g, " ").toLowerCase().includes(q);
      if (!matchDesc && !matchType) return false;
    }
    return true;
  });

  const hasActiveFilters = typeFilter !== "ALL" || searchQuery !== "";

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-secondary">
          <Filter size={14} />
          <span className="font-medium">Filter</span>
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-lg border bg-white focus:outline-none focus:ring-2 transition-colors appearance-none cursor-pointer pr-7",
            typeFilter !== "ALL" ? cn(theme.accentBorder, theme.accentText) : "border-gray-200 text-foreground",
            theme.accentRing
          )}
        >
          <option value="ALL">All Types</option>
          {uniqueTypes.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
          ))}
        </select>

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search violations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn("pl-8 pr-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-foreground focus:outline-none focus:ring-2 w-48", theme.accentRing)}
          />
        </div>

        {hasActiveFilters && (
          <button
            onClick={() => { setTypeFilter("ALL"); setSearchQuery(""); }}
            className={cn("flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors", theme.accentText)}
          >
            <X size={12} /> Clear
          </button>
        )}

        {hasActiveFilters && (
          <span className="text-xs text-secondary ml-auto">
            {filtered.length} of {violations.length} violations
          </span>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left text-xs font-semibold text-secondary px-5 py-3">Date / Time</th>
                <th className="text-left text-xs font-semibold text-secondary px-5 py-3">Type</th>
                <th className="text-left text-xs font-semibold text-secondary px-5 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-secondary px-5 py-3">Appeal</th>
                <th className="text-left text-xs font-semibold text-secondary px-5 py-3">Description</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-secondary">
                    {hasActiveFilters ? "No violations match your filters" : "No violations"}
                  </td>
                </tr>
              ) : (
                filtered.map((v: any, i: number) => {
                  const vType = v.violationType || v.type || "";
                  const vTime = v.violationTime || v.createdAt;
                  const vStatus = v.violationStatus || "ESTABLISHED";
                  const vAppeal = v.appealStatus || "NOT_RAISED";
                  return (
                    <tr key={v.id} className={cn(
                      "border-b border-gray-50 last:border-0 hover:bg-blue-50/40 transition-colors",
                      i % 2 === 1 && "bg-gray-50/30"
                    )}>
                      <td className="px-5 py-2.5 text-sm font-mono">
                        <span className="font-medium">
                          {vTime ? new Date(vTime).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "-"}
                        </span>
                        {vTime && (
                          <span className="text-xs text-secondary ml-1.5">
                            {new Date(vTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-2.5">
                        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
                          "bg-red-50 text-red-600": vType.includes("LATE") || vType === "SELFIE_FAIL",
                          "bg-amber-50 text-amber-600": vType.includes("GPS") || vType.includes("REJECTION"),
                          "bg-blue-50 text-blue-600": vType.includes("DROP_OFF") || vType === "EQUIPMENT_MISSING",
                          "bg-purple-50 text-purple-600": vType.includes("PHOTO") || vType === "SHIFT_NOT_BOOKED",
                          "bg-orange-50 text-orange-600": vType.includes("ORDER") && !vType.includes("REJECTION"),
                          "bg-gray-100 text-gray-500": !["LATE", "GPS", "REJECTION", "DROP_OFF", "PHOTO", "ORDER", "SELFIE", "EQUIPMENT", "SHIFT"].some(k => vType.includes(k)),
                        })}>
                          {vType.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-5 py-2.5">
                        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
                          "bg-red-50 text-red-600": vStatus === "ESTABLISHED",
                          "bg-amber-50 text-amber-600": vStatus === "UNDER_REVIEW",
                          "bg-green-50 text-green-600": vStatus === "OVERTURNED",
                          "bg-gray-100 text-gray-500": vStatus === "EXPIRED",
                        })}>
                          {vStatus.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-5 py-2.5">
                        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
                          "bg-gray-100 text-gray-400": vAppeal === "NOT_RAISED",
                          "bg-amber-50 text-amber-600": vAppeal === "PENDING",
                          "bg-green-50 text-green-600": vAppeal === "APPROVED",
                          "bg-red-50 text-red-600": vAppeal === "REJECTED",
                        })}>
                          {vAppeal.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-sm text-secondary max-w-xs truncate">
                        {v.details || v.description || <span className="text-gray-300">-</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   RESTRICTIONS TAB
   ══════════════════════════════════════════════════════════════════════════ */

function RestrictionsTab({ restrictions, driverId, refetchRestrictions, theme }: {
  restrictions: any[]; driverId: string; refetchRestrictions: () => void; theme: PlatformTheme;
}) {
  const [showAddRestriction, setShowAddRestriction] = useState(false);
  const [restrictionForm, setRestrictionForm] = useState({ type: "TEMPORARY", startDate: "", endDate: "", reason: "" });
  const [restrictionSaving, setRestrictionSaving] = useState(false);
  const [restrictionError, setRestrictionError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-secondary uppercase tracking-wide">Restriction History</h3>
        <button
          onClick={() => { setShowAddRestriction(true); setRestrictionError(null); setRestrictionForm({ type: "TEMPORARY", startDate: "", endDate: "", reason: "" }); }}
          className="flex items-center gap-2 px-3 py-2 bg-amber-600 text-white text-sm font-medium rounded-xl hover:bg-amber-700 transition-colors"
        >
          <Ban size={14} /> Add Restriction
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="text-left text-xs font-semibold text-secondary px-5 py-3">Type</th>
              <th className="text-left text-xs font-semibold text-secondary px-5 py-3">Start</th>
              <th className="text-left text-xs font-semibold text-secondary px-5 py-3">End</th>
              <th className="text-left text-xs font-semibold text-secondary px-5 py-3">Reason</th>
              <th className="text-left text-xs font-semibold text-secondary px-5 py-3">Processed</th>
              <th className="text-left text-xs font-semibold text-secondary px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {restrictions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-secondary">
                  No restrictions on record
                </td>
              </tr>
            ) : (
              restrictions.map((r: any, i: number) => (
                <tr key={r.id} className={cn("border-b border-gray-50 last:border-0", i % 2 === 1 && "bg-gray-50/30")}>
                  <td className="px-5 py-3">
                    <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
                      "bg-amber-50 text-amber-700": r.type === "TEMPORARY",
                      "bg-red-100 text-red-700": r.type === "PERMANENT",
                    })}>
                      {r.type === "PERMANENT" ? "Permanent" : "Temporary"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm font-mono">
                    {new Date(r.startDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-5 py-3 text-sm font-mono text-secondary">
                    {r.endDate
                      ? new Date(r.endDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
                      : <span className="text-red-500 font-medium">{"\u221E"}</span>}
                  </td>
                  <td className="px-5 py-3 text-sm text-secondary max-w-xs truncate">
                    {r.reason || <span className="text-gray-300">{"\u2014"}</span>}
                  </td>
                  <td className="px-5 py-3">
                    {r.processedAt ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 size={12} /> Auto-processed
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Pending</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={async () => {
                        if (!confirm("Lift this restriction and restore driver to ACTIVE?")) return;
                        await api.delete(`/api/driver-restrictions/${r.id}`);
                        refetchRestrictions();
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Lift restriction"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Restriction Modal */}
      {showAddRestriction && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ban size={18} className="text-amber-600" />
                <h2 className="text-base font-semibold">Add Restriction</h2>
              </div>
              <button onClick={() => setShowAddRestriction(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-secondary uppercase tracking-wide">Type</label>
                <div className="flex gap-2 mt-1.5">
                  {[{ v: "TEMPORARY", label: "Temporary (date range)" }, { v: "PERMANENT", label: "Permanent" }].map(({ v, label }) => (
                    <button
                      key={v}
                      onClick={() => setRestrictionForm(f => ({ ...f, type: v }))}
                      className={cn(
                        "flex-1 py-2 text-sm font-medium rounded-xl border transition-colors",
                        restrictionForm.type === v
                          ? "border-amber-400 bg-amber-50 text-amber-700"
                          : "border-gray-200 text-secondary hover:border-gray-300"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-secondary uppercase tracking-wide">Start Date</label>
                <input
                  type="date"
                  value={restrictionForm.startDate}
                  onChange={e => setRestrictionForm(f => ({ ...f, startDate: e.target.value }))}
                  className="mt-1.5 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>

              {restrictionForm.type === "TEMPORARY" && (
                <div>
                  <label className="text-xs font-medium text-secondary uppercase tracking-wide">End Date</label>
                  <input
                    type="date"
                    value={restrictionForm.endDate}
                    min={restrictionForm.startDate}
                    onChange={e => setRestrictionForm(f => ({ ...f, endDate: e.target.value }))}
                    className="mt-1.5 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-200"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-secondary uppercase tracking-wide">Reason (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Platform restriction"
                  value={restrictionForm.reason}
                  onChange={e => setRestrictionForm(f => ({ ...f, reason: e.target.value }))}
                  className="mt-1.5 w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>

              {restrictionError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{restrictionError}</p>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowAddRestriction(false)}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-gray-200 text-secondary hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={restrictionSaving || !restrictionForm.startDate || (restrictionForm.type === "TEMPORARY" && !restrictionForm.endDate)}
                onClick={async () => {
                  setRestrictionSaving(true);
                  setRestrictionError(null);
                  try {
                    await api.post("/api/driver-restrictions", {
                      driverId,
                      type: restrictionForm.type,
                      startDate: restrictionForm.startDate,
                      endDate: restrictionForm.type === "TEMPORARY" ? restrictionForm.endDate : undefined,
                      reason: restrictionForm.reason || undefined,
                    });
                    setShowAddRestriction(false);
                    refetchRestrictions();
                  } catch (err: any) {
                    setRestrictionError(err.response?.data?.error || "Failed to save restriction");
                  } finally {
                    setRestrictionSaving(false);
                  }
                }}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {restrictionSaving ? "Saving..." : "Confirm Restriction"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
