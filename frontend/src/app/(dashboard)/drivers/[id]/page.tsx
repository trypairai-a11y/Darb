"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  Phone,
  Radio,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApi";
import type { DriverFileData } from "@/types/driver-file";
import ScoreTrendChart from "@/components/driver-file/ScoreTrendChart";
import AskDarbWhyDrawer from "@/components/driver-file/AskDarbWhyDrawer";

const TABS = ["Overview", "Work", "Money", "Compliance", "Notes"] as const;
type DriverFileTab = (typeof TABS)[number];

const fallback = "Not set";

function formatEnum(value?: string | null) {
  if (!value) return fallback;
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatTime(value?: string | null) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatMoney(value?: number | null) {
  return `KD ${Number(value ?? 0).toFixed(3)}`;
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
  const score = data.score;
  if (!score) return <p className="text-sm text-sand-700">Score is being prepared.</p>;
  const rows = [
    ["Attendance", score.attendanceScore],
    ["Delivery", score.deliveryScore],
    ["Financial", score.financialScore],
    ["Equipment", score.equipmentScore],
    ["Platform", score.platformScore],
  ] as const;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="text-4xl font-semibold text-foreground">{score.compositeScore}</div>
        <div className="pb-1 text-sm text-sand-700">out of 100</div>
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
  const [tab, setTab] = useState<DriverFileTab>("Overview");
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
  if (error && (error as any).status === 404) return <ErrorState title="Driver not found" />;
  if (error || !data) return <ErrorState title="Unable to load driver file" message={(error as any)?.message} />;

  const p = data.profile;
  const initials = p.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="w-full max-w-none space-y-5 p-6 lg:p-8">
      <header className="rounded-lg border border-sand-200 bg-white p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-semibold text-white">
              {initials || "D"}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold tracking-normal text-foreground">{p.name}</h1>
                <Pill tone={statusTone(p.status)}>{formatEnum(p.status)}</Pill>
                <Pill>{formatEnum(p.performanceTier)}</Pill>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-sand-700">
                <span>{formatEnum(p.platform)}</span>
                <span>{formatEnum(p.vehicleType)}</span>
                <span>{p.zone ?? fallback}</span>
                <span>{p.company?.name ?? fallback}</span>
              </div>
            </div>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[360px]">
            <div className="rounded-lg border border-sand-200 px-3 py-2">
              <div className="text-xs text-sand-700">Phone</div>
              <div className="mt-1 flex items-center gap-2 font-medium">
                <Phone size={14} aria-hidden="true" />
                {p.phone || fallback}
              </div>
            </div>
            <div className="rounded-lg border border-sand-200 px-3 py-2">
              <div className="text-xs text-sand-700">Live status</div>
              <div className="mt-1 flex items-center gap-2 font-medium">
                <Radio size={14} aria-hidden="true" />
                {data.liveStatus.onlineNow ? "Online now" : "Offline"}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-5">
        <Metric label="Score" value={data.score ? `${data.score.compositeScore}` : fallback} icon={<ShieldCheck size={18} />} />
        <Metric label="Today orders" value={String(data.orders.todayCount)} icon={<CheckCircle2 size={18} />} />
        <Metric label="Week orders" value={String(data.orders.weekCount)} icon={<CalendarClock size={18} />} />
        <Metric label="Cash due" value={formatMoney(data.cash.outstanding)} icon={<Wallet size={18} />} />
        <Metric label="Violations" value={String(data.violations.items.length)} icon={<FileCheck2 size={18} />} />
      </div>

      <nav className="rounded-lg border border-sand-200 bg-white p-1">
        <div className="grid gap-1 sm:grid-cols-5">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                tab === item ? "bg-foreground text-white" : "text-sand-700 hover:bg-sand-100 hover:text-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </nav>

      {tab === "Overview" && (
        <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <div className="space-y-5">
            <Panel title="Profile">
              <KeyValueGrid
                rows={[
                  ["Platform ID", p.platformDriverId ?? fallback],
                  ["Company", p.company?.name ?? fallback],
                  ["Supervisor", p.supervisor?.name ?? fallback],
                  ["Zone", p.zone ?? fallback],
                  ["Batch", p.batchNumber ?? fallback],
                  ["Hire date", formatDate(p.hireDate)],
                  ["Average monthly salary", p.monthlySalary ? formatMoney(p.monthlySalary) : fallback],
                  ["Civil ID", formatEnum(p.civilIdStatus)],
                  ["Civil ID expiry", formatDate(p.civilIdExpiry)],
                ]}
              />
            </Panel>
            <Panel title="Batch history">
              {data.batchHistory.length ? (
                <SimpleTable
                  rows={data.batchHistory}
                  empty="No batch changes recorded."
                  columns={[
                    { key: "batch", label: "Batch", render: (row) => <Pill>{row.batchNumber ?? fallback}</Pill> },
                    { key: "changedAt", label: "Changed", render: (row) => formatDate(row.changedAt) },
                  ]}
                />
              ) : (
                <p className="text-sm text-sand-700">
                  Currently in batch <span className="font-medium text-foreground">{p.batchNumber ?? fallback}</span>. No batch changes recorded yet — future changes will appear here week by week.
                </p>
              )}
            </Panel>
            <Panel title="90 day score">
              <ScoreTrendChart points={trendPoints} />
            </Panel>
          </div>
          <div className="space-y-5">
            <Panel title="Score">
              <ScoreBars data={data} />
            </Panel>
          </div>
        </div>
      )}

      {tab === "Work" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="Recent shifts">
            <SimpleTable
              rows={data.shifts.recent}
              empty="No shifts recorded for this driver."
              columns={[
                { key: "date", label: "Date", render: (row) => formatDate(row.date) },
                { key: "time", label: "Time", render: (row) => `${formatTime(row.scheduledStart)} to ${formatTime(row.scheduledEnd)}` },
                { key: "zone", label: "Zone", render: (row) => row.deliveryArea ?? row.zone ?? fallback },
                { key: "status", label: "Status", render: (row) => <Pill tone={statusTone(row.status)}>{formatEnum(row.status)}</Pill> },
              ]}
            />
          </Panel>
          <Panel title="Recent orders">
            <SimpleTable
              rows={data.orders.recent}
              empty="No orders recorded for this driver."
              columns={[
                { key: "date", label: "Date", render: (row) => formatDate(row.date) },
                { key: "restaurant", label: "Restaurant", render: (row) => row.restaurantName ?? fallback },
                { key: "orders", label: "Orders", render: (row) => row.orderCount },
                { key: "cash", label: "Cash", render: (row) => formatMoney(row.cashCollected) },
                { key: "arrival", label: "Arrival", render: (row) => formatTime(row.arrivalTime) },
              ]}
            />
          </Panel>
        </div>
      )}

      {tab === "Money" && (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <Panel title="Cash position">
            <KeyValueGrid
              rows={[
                ["Outstanding", formatMoney(data.cash.outstanding)],
                ["Today cash", formatMoney(data.orders.todayCash)],
                ["Week cash", formatMoney(data.orders.weekCash)],
              ]}
            />
          </Panel>
          <Panel title="Cash records">
            <SimpleTable
              rows={data.cash.records}
              empty="No cash records for this driver."
              columns={[
                { key: "date", label: "Date", render: (row) => formatDate(row.date) },
                { key: "sales", label: "Sales", render: (row) => formatMoney(row.salesAmount) },
                { key: "collection", label: "Collected", render: (row) => formatMoney(row.collectionAmount) },
                { key: "pending", label: "Due", render: (row) => formatMoney(row.pendingDues) },
                { key: "status", label: "Status", render: (row) => <Pill tone={statusTone(row.status)}>{formatEnum(row.status)}</Pill> },
              ]}
            />
          </Panel>
        </div>
      )}

      {tab === "Compliance" && (
        <div className="space-y-5">
          <Panel title="Documents">
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
            <Panel title="Violations">
              <SimpleTable
                rows={data.violations.items}
                empty="No violations for this driver."
                columns={[
                  { key: "time", label: "Date", render: (row) => formatDate(row.violationTime) },
                  { key: "type", label: "Type", render: (row) => formatEnum(row.violationType) },
                  { key: "status", label: "Status", render: (row) => <Pill tone={statusTone(row.violationStatus)}>{formatEnum(row.violationStatus)}</Pill> },
                  { key: "appeal", label: "Appeal", render: (row) => formatEnum(row.appealStatus) },
                ]}
              />
            </Panel>
            <Panel title="Restrictions">
              <SimpleTable
                rows={data.violations.restrictions}
                empty="No restrictions for this driver."
                columns={[
                  { key: "type", label: "Type", render: (row) => formatEnum(row.type) },
                  { key: "start", label: "Start", render: (row) => formatDate(row.startDate) },
                  { key: "end", label: "End", render: (row) => (row.endDate ? formatDate(row.endDate) : "Permanent") },
                  { key: "active", label: "State", render: (row) => <Pill tone={row.active ? statusTone("PENDING") : statusTone("COMPLETED")}>{row.active ? "Active" : "Closed"}</Pill> },
                ]}
              />
            </Panel>
            <Panel title="Penalties">
              <SimpleTable
                rows={data.violations.penalties}
                empty="No penalties for this driver."
                columns={[
                  { key: "date", label: "Date", render: (row) => formatDate(row.createdAt) },
                  { key: "type", label: "Type", render: (row) => formatEnum(row.penaltyType) },
                  { key: "value", label: "Value", render: (row) => row.penaltyValue ?? fallback },
                  { key: "status", label: "Status", render: (row) => <Pill tone={statusTone(row.penaltyStatus)}>{formatEnum(row.penaltyStatus)}</Pill> },
                ]}
              />
            </Panel>
            <Panel title="Tickets">
              <SimpleTable
                rows={data.tickets}
                empty="No tickets for this driver."
                columns={[
                  { key: "number", label: "Ticket", render: (row) => row.ticketNumber },
                  { key: "title", label: "Title", render: (row) => row.title },
                  { key: "priority", label: "Priority", render: (row) => <Pill tone={statusTone(row.priority)}>{formatEnum(row.priority)}</Pill> },
                  { key: "status", label: "Status", render: (row) => formatEnum(row.status) },
                ]}
              />
            </Panel>
          </div>
        </div>
      )}

      {tab === "Notes" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="Agent notes">
            <div className="space-y-3">
              {data.agentNotes.observations.length ? (
                data.agentNotes.observations.map((note) => (
                  <div key={note.id} className="rounded-lg border border-sand-200 p-4">
                    <p className="text-sm font-medium text-foreground">{memoryText(note.value)}</p>
                    <p className="mt-2 text-xs text-sand-700">{formatDate(note.createdAt)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-sand-700">No notes for this driver.</p>
              )}
            </div>
          </Panel>
          <Panel title="Recent decisions">
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
                <p className="text-sm text-sand-700">No decision activity for this driver.</p>
              )}
            </div>
          </Panel>
          <Panel title="Inventory">
            <div className="grid gap-3 md:grid-cols-2">
              {data.assets.inventory.map((item) => (
                <div key={item.id} className="rounded-lg border border-sand-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{formatEnum(item.itemType)}</p>
                      <p className="mt-1 text-sm text-sand-700">Quantity {item.quantity}</p>
                    </div>
                    <Pill tone={item.issued ? statusTone("VALID") : statusTone("PENDING")}>{item.issued ? "Issued" : "Pending"}</Pill>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Vehicle care">
            <div className="grid gap-5 lg:grid-cols-2">
              <SimpleTable
                rows={data.assets.inspections}
                empty="No inspections for this driver."
                columns={[
                  { key: "date", label: "Date", render: (row) => formatDate(row.date) },
                  { key: "status", label: "Status", render: (row) => <Pill tone={statusTone(row.status)}>{formatEnum(row.status)}</Pill> },
                ]}
              />
              <SimpleTable
                rows={data.assets.maintenance}
                empty="No maintenance records for this driver."
                columns={[
                  { key: "date", label: "Date", render: (row) => formatDate(row.createdAt) },
                  { key: "type", label: "Work", render: (row) => row.type },
                  { key: "cost", label: "Cost", render: (row) => formatMoney(row.cost) },
                ]}
              />
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
