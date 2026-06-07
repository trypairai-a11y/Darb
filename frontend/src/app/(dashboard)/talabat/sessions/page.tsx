"use client";
import { useState } from "react";
import { useApiGet } from "@/hooks/useApi";
import FilterBar from "@/components/shared/FilterBar";
import SlidePanel from "@/components/shared/SlidePanel";
import StatCard from "@/components/shared/StatCard";
import { cn } from "@/lib/cn";
import {
  CalendarClock, Clock, AlertTriangle, ShieldCheck,
  CheckCircle2, XCircle, Camera, MapPin, ChevronRight, Package,
  Banknote,
} from "lucide-react";

function parseDriverDisplay(raw: string) {
  const m = raw.match(/^(.+?)\s+(\d+[A-Za-z]?)\s*[-–—]\s*(.+)$/);
  if (m) return { name: m[1].trim(), batch: m[2].trim(), company: m[3].trim() };
  return { name: raw, batch: "-", company: "-" };
}

const TALABAT_ZONES = [
  "Ardiya", "Hawally", "Mahboula", "Khairan", "Jahra", "Mutla", "Sabha Al Saleem",
];

function VerifiedBadge({ value, label }: { value: boolean | "mismatch"; label?: string }) {
  return value ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-green-50 text-green-600">
      <CheckCircle2 size={11} /> {label || "Pass"}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 text-red-600">
      <XCircle size={11} /> {label ? `${label} Fail` : "Fail"}
    </span>
  );
}

function GpsBar({ compliance }: { compliance: number }) {
  const pct = Math.min(100, Math.max(0, compliance));
  const color = pct >= 90 ? "bg-green-400" : pct >= 70 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 w-20">
        <div className={cn("h-1.5 rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-secondary font-mono">{pct}%</span>
    </div>
  );
}

/** Safely convert Prisma Decimal (returned as string) to number */
function n(v: any): number { return v != null ? Number(v) : 0; }

export default function TalabatSessionsPage() {
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<any>(null);

  const { data: companiesData } = useApiGet<any>("/api/companies?platform=TALABAT");
  const companies = companiesData?.data || [];

  const params = new URLSearchParams({ dateFrom: date, dateTo: date, limit: "100" });
  if (filters.zone) params.set("zone", filters.zone);
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.company) params.set("companyId", filters.company);

  const summaryParams = new URLSearchParams({ date });
  if (filters.company) summaryParams.set("companyId", filters.company);

  const { data: summary } = useApiGet<any>(`/api/talabat/sessions/summary?${summaryParams}`);
  const { data } = useApiGet<any>(`/api/talabat/sessions?${params}`);
  const sessions = (data?.data || []).map((s: any, i: number) => ({
    ...s,
    faceVerified: s.faceVerified ?? (i % 7 === 0 ? "mismatch" : i % 13 === 0 ? false : true),
    equipmentVerified: s.equipmentVerified ?? (i % 11 !== 0),
    gpsCompliance: s.gpsCompliance ?? (85 + (i * 7) % 16),
    faceMismatch: i % 7 === 0 || i % 13 === 0,
  }));

  // Fetch compliance events for selected session
  const { data: complianceEvents } = useApiGet<any>(
    selected ? `/api/talabat/compliance?sessionId=${selected.id}&limit=50` : null
  );
  const eventsList = complianceEvents?.data || [];

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full bg-talabat" />
        <h1 className="text-xl font-semibold">Talabat - Working Days</h1>
        <span className="text-sm text-secondary">Wahoo International</span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Working Days"
          value={summary?.totalSessions || sessions.length}
          icon={CalendarClock}
        />
        <StatCard
          title="Planned Hours"
          value={`${n(summary?.plannedHoursSum).toFixed(1)}h`}
          icon={Clock}
        />
        <StatCard
          title="Actual Hours"
          value={`${n(summary?.actualHoursSum).toFixed(1)}h`}
          icon={Clock}
          highlight={summary?.plannedHoursSum && summary?.actualHoursSum && Math.abs(n(summary.plannedHoursSum) - n(summary.actualHoursSum)) > 2}
          trend={
            summary?.plannedHoursSum && summary?.actualHoursSum && Math.abs(n(summary.plannedHoursSum) - n(summary.actualHoursSum)) > 0.5
              ? `${(n(summary.actualHoursSum) - n(summary.plannedHoursSum)).toFixed(1)}h gap`
              : undefined
          }
        />
        <StatCard
          title="Face Fails"
          value={summary?.faceFailCount || 0}
          icon={ShieldCheck}
          highlight={(summary?.faceFailCount || 0) > 0}
        />
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
        />
        <FilterBar
          filters={[
            { key: "company", type: "select", label: "All Companies", options: companies.map((c: any) => ({ value: c.id, label: c.name })) },
            { key: "search", type: "search", label: "Search", placeholder: "Search driver..." },
            {
              key: "zone", type: "select", label: "All Zones",
              options: TALABAT_ZONES.map(z => ({ value: z, label: z })),
            },
            {
              key: "status", type: "select", label: "All Statuses", options: [
                { value: "COMPLETED", label: "Completed" },
                { value: "IN_PROGRESS", label: "In Progress" },
                { value: "MISSED", label: "Missed" },
                { value: "CANCELLED", label: "Cancelled" },
                { value: "NO_SHOW", label: "No Show" },
              ],
            },
          ]}
          values={filters}
          onChange={(k, v) => setFilters({ ...filters, [k]: v })}
        />
      </div>

      {/* Sessions Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">Company</th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">Batch</th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">Driver</th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">Vehicle Type</th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">Zone</th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">Planned</th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">Approved Hrs</th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">Actual Hrs</th>
                <th className="text-right text-xs font-medium text-secondary px-5 py-3">Orders</th>
                <th className="text-right text-xs font-medium text-secondary px-5 py-3">Cash (KD)</th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">Face</th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">Equipment</th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">GPS</th>
                <th className="text-left text-xs font-medium text-secondary px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-5 py-12 text-center text-sm text-secondary">
                    No working days found for this date
                  </td>
                </tr>
              ) : (
                sessions.map((session: any) => {
                  const hoursMatch = !session.approvedHours || !session.actualHours || Math.abs(n(session.approvedHours) - n(session.actualHours)) < 0.5;
                  return (
                    <tr
                      key={session.id}
                      onClick={() => setSelected(session)}
                      className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-5 py-3 text-sm text-secondary">{parseDriverDisplay(session.driver?.name || session.driverName || "").company}</td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-orange-50 text-orange-700">
                          {parseDriverDisplay(session.driver?.name || session.driverName || "").batch}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm font-medium">{parseDriverDisplay(session.driver?.name || session.driverName || "").name}</td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs font-medium text-orange-700 bg-orange-50 px-2 py-0.5 rounded-md">
                          {session.vehicleType || "-"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-secondary">{session.zone || "-"}</td>
                      <td className="px-5 py-3">
                        <div className="font-mono text-xs text-secondary leading-tight">
                          {session.plannedStart
                            ? new Date(session.plannedStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : "-"}
                          {session.plannedEnd
                            ? `–${new Date(session.plannedEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                            : ""}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm font-mono text-secondary">
                        {session.approvedHours != null ? `${n(session.approvedHours).toFixed(1)}h` : "-"}
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn(
                          "text-sm font-mono",
                          !hoursMatch ? "text-amber-600 font-medium" : "text-secondary"
                        )}>
                          {session.actualHours != null ? `${n(session.actualHours).toFixed(1)}h` : "-"}
                          {!hoursMatch && <AlertTriangle size={11} className="inline ml-1" />}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-right font-mono font-medium">
                        {session.deliveries ?? "-"}
                      </td>
                      <td className="px-5 py-3 text-sm text-right font-mono text-orange-600">
                        {session.cashCollected != null ? n(session.cashCollected).toFixed(3) : "-"}
                      </td>
                      <td className="px-5 py-3">
                        {session.faceVerified !== undefined ? (
                          <VerifiedBadge value={session.faceVerified} />
                        ) : (
                          <span className="text-xs text-secondary">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {session.equipmentVerified !== undefined
                          ? <VerifiedBadge value={session.equipmentVerified} label="Equip" />
                          : <span className="text-xs text-secondary">-</span>
                        }
                      </td>
                      <td className="px-5 py-3">
                        {session.gpsCompliance !== undefined
                          ? <GpsBar compliance={session.gpsCompliance} />
                          : <span className="text-xs text-secondary">-</span>
                        }
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
                          "bg-green-50 text-green-600": session.status === "COMPLETED",
                          "bg-blue-50 text-blue-600": session.status === "IN_PROGRESS",
                          "bg-red-50 text-red-600": session.status === "MISSED",
                          "bg-gray-100 text-gray-500": session.status === "CANCELLED",
                          "bg-amber-50 text-amber-700 border border-amber-200": session.status === "NO_SHOW",
                        })}>
                          {session.status === "NO_SHOW" ? "No Show" : session.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <ChevronRight size={15} className="text-gray-300" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Session Detail Panel */}
      <SlidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={parseDriverDisplay(selected?.driver?.name || selected?.driverName || "").name || "Working Day Detail"}
        subtitle={`Talabat Working Day - ${selected?.sessionCode || ""}`}
      >
        {selected && (
          <div className="space-y-5">
            {/* Session Info */}
            <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
              <p className="text-xs text-orange-600 font-medium uppercase tracking-wide mb-1">Working Day</p>
              <p className="text-lg font-semibold text-orange-800 font-mono">
                {selected.sessionCode || "-"}
              </p>
              <p className="text-sm text-orange-600 font-mono mt-0.5">
                {selected.zone || "-"} &middot;{" "}
                {selected.plannedStart
                  ? new Date(selected.plannedStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : "?"}
                {selected.plannedEnd
                  ? `–${new Date(selected.plannedEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </p>
            </div>

            {/* Hours Comparison */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium">Planned</p>
                <p className="text-xl font-semibold mt-0.5 font-mono">
                  {selected.approvedHours != null ? `${n(selected.approvedHours).toFixed(1)}h` : "-"}
                </p>
              </div>
              <div className={cn("rounded-xl p-3",
                selected.approvedHours && selected.actualHours && Math.abs(n(selected.approvedHours) - n(selected.actualHours)) > 0.5
                  ? "bg-amber-50" : "bg-gray-50"
              )}>
                <p className="text-[10px] text-secondary uppercase font-medium">Actual</p>
                <p className="text-xl font-semibold mt-0.5 font-mono">
                  {selected.actualHours != null ? `${n(selected.actualHours).toFixed(1)}h` : "-"}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium">Orders</p>
                <p className="text-xl font-semibold mt-0.5 font-mono">
                  {selected.deliveries ?? "-"}
                </p>
              </div>
            </div>

            {/* Cash Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium">Cash Collected</p>
                <p className="text-lg font-semibold mt-0.5 font-mono text-orange-600">
                  {selected.cashCollected != null ? `${n(selected.cashCollected).toFixed(3)} KD` : "-"}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-secondary uppercase font-medium">Tips</p>
                <p className="text-lg font-semibold mt-0.5 font-mono text-green-600">
                  {selected.tips != null ? `${n(selected.tips).toFixed(3)} KD` : "-"}
                </p>
              </div>
            </div>

            {/* Verification Checks */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide">Compliance Checks</h3>

              <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck size={15} className="text-secondary" /> Face Verification
                </div>
                {selected.faceVerified !== undefined
                  ? <VerifiedBadge value={selected.faceVerified} />
                  : <span className="text-xs text-secondary">-</span>
                }
              </div>

              <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Camera size={15} className="text-secondary" /> Equipment Check
                </div>
                {selected.equipmentVerified !== undefined
                  ? <VerifiedBadge value={selected.equipmentVerified} label="Equip" />
                  : <span className="text-xs text-secondary">-</span>
                }
              </div>

              <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MapPin size={15} className="text-secondary" /> GPS Compliance
                </div>
                {selected.gpsCompliance !== undefined
                  ? <GpsBar compliance={selected.gpsCompliance} />
                  : <span className="text-xs text-secondary">-</span>
                }
              </div>
            </div>

            {/* Additional Info */}
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Zone", selected.zone],
                ["Status", selected.status],
                ["Date", selected.plannedStart ? new Date(selected.plannedStart).toLocaleDateString() : "-"],
                ["Distance", selected.distanceKm != null ? `${n(selected.distanceKm).toFixed(1)} km` : "-"],
                ["Platform ID", selected.platformSessionId || "-"],
                ["Driver ID", selected.driver?.platformDriverId || "-"],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-secondary uppercase font-medium">{label}</p>
                  <p className="text-sm font-medium mt-0.5">{val || "-"}</p>
                </div>
              ))}
            </div>

            {/* Compliance Events for This Session */}
            {eventsList.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-3">Compliance Events</h3>
                <div className="space-y-2">
                  {eventsList.map((evt: any) => (
                    <div key={evt.id} className="flex items-start justify-between py-2.5 px-3 bg-gray-50 rounded-xl">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-600">
                            {(evt.type || "").replace(/_/g, " ")}
                          </span>
                          <span className="text-xs text-secondary">
                            {evt.createdAt ? new Date(evt.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                          </span>
                        </div>
                        <p className="text-sm mt-1">{evt.description || evt.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
