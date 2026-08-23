"use client";
import { useState } from "react";
import { useApiGet } from "@/hooks/useApi";
import SlidePanel from "@/components/shared/SlidePanel";
import { cn } from "@/lib/cn";
import { Plus, X, Check } from "lucide-react";
import api from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate, formatDateTime } from "@/i18n/format";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || "";
const photoUrl = (path: string) => (path.startsWith("http") ? path : `${API_ORIGIN}${path}`);

const PRIORITY_DOT: Record<string, string> = {
  URGENT: "bg-red-500",
  HIGH: "bg-clay",
  MEDIUM: "bg-sand-400",
  LOW: "bg-sand-200",
};

const STATUS_TONE: Record<string, string> = {
  // moss, not navy: `forest` is not a colour in tailwind.config, so every
  // forest-* class rendered as nothing and OPEN tickets showed in the inherited
  // body colour, indistinguishable from CLOSED. The palette was recoloured
  // forest to navy, but navy-600 sits next to ASSIGNED's slate2 and the two
  // would read as the same status in the column.
  OPEN: "text-moss",
  ASSIGNED: "text-slate2",
  IN_PROGRESS: "text-clay",
  RESOLVED: "text-sand-500",
  CLOSED: "text-sand-400",
};

const PLATFORM_DOT: Record<string, string> = {
  KEETA: "bg-keeta",
  TALABAT: "bg-talabat",
  DELIVEROO: "bg-deliveroo",
  AMERICANA: "bg-americana",
};

const STATUS_TABS: Array<{ key: string; labelKey: string }> = [
  { key: "", labelKey: "all" },
  { key: "OPEN", labelKey: "open" },
  { key: "IN_PROGRESS", labelKey: "inProgress" },
  { key: "RESOLVED", labelKey: "resolved" },
];

export default function TicketsPage() {
  const { t, locale } = useI18n();
  const [statusFilter, setStatusFilter] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);

  const params = new URLSearchParams({ limit: "50" });
  if (statusFilter) params.set("status", statusFilter);

  const { data: ticketsData, refetch } = useApiGet<any>(`/api/tickets?${params}`);
  const tickets = ticketsData?.data || [];

  const openCount = tickets.filter((tk: any) => ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(tk.status)).length;
  const overdueCount = tickets.filter((tk: any) => tk.slaDeadline && new Date(tk.slaDeadline) < new Date() && tk.status !== "RESOLVED" && tk.status !== "CLOSED").length;
  const resolvedWeek = tickets.filter((tk: any) => tk.status === "RESOLVED").length;

  const statusLabel = (s: string) => {
    switch (s) {
      case "OPEN": return t("tickets.statusOpen");
      case "ASSIGNED": return t("tickets.statusAssigned");
      case "IN_PROGRESS": return t("tickets.statusInProgress");
      case "RESOLVED": return t("tickets.statusResolved");
      case "CLOSED": return t("tickets.statusClosed");
      default: return s;
    }
  };
  const tabLabel = (key: string) => {
    switch (key) {
      case "": return t("companies.allStatuses");
      case "OPEN": return t("tickets.statusOpen");
      case "IN_PROGRESS": return t("tickets.statusInProgress");
      case "RESOLVED": return t("tickets.statusResolved");
      case "CLOSED": return t("tickets.statusClosed");
      default: return key;
    }
  };
  const priorityLabel = (p: string) => {
    switch (p) {
      case "URGENT": return t("tickets.priorityUrgent");
      case "HIGH": return t("tickets.priorityHigh");
      case "MEDIUM": return t("tickets.priorityMedium");
      case "LOW": return t("tickets.priorityLow");
      default: return p;
    }
  };
  const categoryLabel = (c: string) => {
    switch (c) {
      case "VEHICLE_REPAIR": return t("tickets.catVehicleRepair");
      case "EQUIPMENT_REQUEST": return t("tickets.catEquipmentRequest");
      case "LEAVE_REQUEST": return t("tickets.catLeaveRequest");
      case "SALARY_ISSUE": return t("tickets.catSalaryIssue");
      case "TRANSFER_REQUEST": return t("tickets.catTransferRequest");
      case "COMPLAINT": return t("tickets.catComplaint");
      case "ACCIDENT_REPORT": return t("tickets.catAccidentReport");
      case "OTHER": return t("tickets.catOther");
      default: return c;
    }
  };

  const [newTicket, setNewTicket] = useState({
    category: "OTHER",
    priority: "MEDIUM",
    title: "",
    description: "",
    submitterType: "USER",
  });

  const handleCreateTicket = async () => {
    try {
      await api.post("/api/tickets", newTicket);
      setShowNewModal(false);
      setNewTicket({ category: "OTHER", priority: "MEDIUM", title: "", description: "", submitterType: "USER" });
      refetch();
    } catch (err) {
      console.error("Failed to create ticket", err);
    }
  };

  const [statusUpdating, setStatusUpdating] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");

  const handleChangeStatus = async (next: string) => {
    if (!selectedTicket || selectedTicket.status === next) return;
    if (next === "RESOLVED") {
      setResolutionNote(selectedTicket.resolution || "");
      setResolveOpen(true);
      return;
    }
    setStatusUpdating(true);
    try {
      const data: any = { status: next };
      const updated = await api.put(`/api/tickets/${selectedTicket.id}`, data);
      setSelectedTicket({ ...selectedTicket, ...updated.data });
      refetch();
    } catch (err) {
      console.error("Failed to update ticket status", err);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedTicket) return;
    setStatusUpdating(true);
    try {
      await api.put(`/api/tickets/${selectedTicket.id}/resolve`, { resolution: resolutionNote.trim() });
      setSelectedTicket({
        ...selectedTicket,
        status: "RESOLVED",
        resolution: resolutionNote.trim(),
        resolvedAt: new Date().toISOString(),
      });
      setResolveOpen(false);
      setResolutionNote("");
      refetch();
    } catch (err) {
      console.error("Failed to resolve ticket", err);
    } finally {
      setStatusUpdating(false);
    }
  };

  return (
    <div className="space-y-10 w-full max-w-none">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-display-md tracking-tight text-sand-900 dark:text-foreground">
            {t("tickets.title")}
          </h1>
          <p className="text-sm text-sand-500 mt-2 flex items-center gap-3 flex-wrap">
            <span><span className="text-sand-900 dark:text-foreground font-medium">{openCount}</span> {t("tickets.openTickets").toLowerCase()}</span>
            <span className="text-sand-300">·</span>
            <span className={overdueCount > 0 ? "text-red-500" : ""}>
              <span className={cn("font-medium", overdueCount > 0 ? "text-red-500" : "text-sand-900 dark:text-foreground")}>{overdueCount}</span> {t("tickets.overdue").toLowerCase()}
            </span>
            <span className="text-sand-300">·</span>
            <span><span className="text-sand-900 dark:text-foreground font-medium">{resolvedWeek}</span> {t("tickets.resolvedThisWeek").toLowerCase()}</span>
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-pill shadow-soft hover:shadow-lift transition-all duration-250 ease-sierra-out"
        >
          <Plus size={15} /> {t("tickets.newTicket")}
        </button>
      </div>

      {/* Ghost tab filter */}
      <div className="flex items-center gap-6 border-b border-sand-200 dark:border-border -mb-px">
        {STATUS_TABS.map((tab) => {
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key || "all"}
              onClick={() => setStatusFilter(tab.key)}
              className={cn(
                "relative pb-3 text-sm font-medium transition-colors duration-250 ease-sierra-out",
                active ? "text-sand-900 dark:text-foreground" : "text-sand-500 hover:text-sand-700"
              )}
            >
              {tabLabel(tab.key)}
              {active && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary rounded-pill" />
              )}
            </button>
          );
        })}
      </div>

      {/* Ticket list */}
      {tickets.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-sm text-sand-500">{t("tickets.noTicketsFound")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-sand-100 dark:divide-border/60 -mt-2">
          {tickets.map((ticket: any) => {
            const overdue = ticket.slaDeadline && new Date(ticket.slaDeadline) < new Date() && !["RESOLVED", "CLOSED"].includes(ticket.status);
            return (
              <li
                key={ticket.id}
                onClick={() => setSelectedTicket(ticket)}
                className="group flex items-center gap-4 py-4 -mx-3 px-3 rounded-xl cursor-pointer transition-colors duration-250 ease-sierra-out hover:bg-sand-50 dark:hover:bg-sand-900/30"
              >
                <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", PRIORITY_DOT[ticket.priority])} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sand-900 dark:text-foreground truncate">{ticket.title}</p>
                  <div className="flex items-center gap-2 mt-1 min-w-0 text-[11px] text-sand-500">
                    <span className="font-mono">{ticket.ticketNumber}</span>
                    <span className="text-sand-300">·</span>
                    <span className={cn("whitespace-nowrap", STATUS_TONE[ticket.status])}>
                      {statusLabel(ticket.status).toLowerCase()}
                    </span>
                    {ticket.platform && (
                      <>
                        <span className="text-sand-300">·</span>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <span className={cn("w-1.5 h-1.5 rounded-full", PLATFORM_DOT[ticket.platform] || "bg-sand-300")} />
                          <span className="text-sand-600 lowercase">{ticket.platform.toLowerCase()}</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-end flex-shrink-0">
                  <p className={cn("text-xs truncate max-w-[160px]", ticket.assignedTo?.name ? "text-sand-700 dark:text-foreground/80" : "text-sand-400 italic")}>
                    {ticket.assignedTo?.name || t("tickets.unassigned")}
                  </p>
                  {ticket.slaDeadline && (
                    <p className={cn("text-[11px] mt-0.5", overdue ? "text-red-500 font-medium" : "text-sand-400")}>
                      {overdue ? t("tickets.overdueLabel") : formatDate(ticket.slaDeadline, locale)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* New ticket modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 bg-navy-900/25 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowNewModal(false)}
        >
          <div
            className="bg-card border border-sand-200 rounded-2xl shadow-float w-full max-w-md p-6 animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <h2 className="font-display text-display-sm text-sand-900 dark:text-foreground">{t("tickets.newTicket")}</h2>
              <button
                onClick={() => setShowNewModal(false)}
                className="p-1.5 rounded-pill hover:bg-sand-100 text-sand-700 transition-colors duration-250 ease-sierra-out"
                aria-label={t("common.close")}
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("tickets.category")}>
                  <select
                    value={newTicket.category}
                    onChange={(e) => setNewTicket({ ...newTicket, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-sand-50 border border-sand-200 text-sm focus:outline-none focus:bg-card focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-250"
                  >
                    {["VEHICLE_REPAIR", "EQUIPMENT_REQUEST", "LEAVE_REQUEST", "SALARY_ISSUE", "TRANSFER_REQUEST", "COMPLAINT", "ACCIDENT_REPORT", "OTHER"].map((c) => (
                      <option key={c} value={c}>{categoryLabel(c)}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t("tickets.priority")}>
                  <select
                    value={newTicket.priority}
                    onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-sand-50 border border-sand-200 text-sm focus:outline-none focus:bg-card focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-250"
                  >
                    {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                      <option key={p} value={p}>{priorityLabel(p)}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label={t("tickets.titleField")}>
                <input
                  value={newTicket.title}
                  onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
                  dir="auto"
                  className="w-full px-3 py-2 rounded-xl bg-sand-50 border border-sand-200 text-sm focus:outline-none focus:bg-card focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-250"
                  placeholder={t("tickets.titlePlaceholder")}
                />
              </Field>
              <Field label={t("tickets.description")}>
                <textarea
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                  dir="auto"
                  className="w-full px-3 py-2 rounded-xl bg-sand-50 border border-sand-200 text-sm focus:outline-none focus:bg-card focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-250 h-24 resize-none"
                  placeholder={t("tickets.descriptionPlaceholder")}
                />
              </Field>
              <button
                onClick={handleCreateTicket}
                disabled={!newTicket.title.trim()}
                className="w-full py-2.5 mt-1 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-pill shadow-soft hover:shadow-lift transition-all duration-250 ease-sierra-out"
              >
                {t("tickets.createTicket")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail panel */}
      <SlidePanel
        open={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        title={selectedTicket?.title || ""}
        subtitle={selectedTicket?.ticketNumber}
      >
        {selectedTicket && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-xs text-sand-500 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("w-1.5 h-1.5 rounded-full", PRIORITY_DOT[selectedTicket.priority])} />
                {priorityLabel(selectedTicket.priority).toLowerCase()}
              </span>
              <span className="text-sand-300">·</span>
              <span className={STATUS_TONE[selectedTicket.status]}>{statusLabel(selectedTicket.status).toLowerCase()}</span>
              <span className="text-sand-300">·</span>
              <span className="text-sand-600">{categoryLabel(selectedTicket.category)}</span>
              {selectedTicket.platform && (
                <>
                  <span className="text-sand-300">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("w-1.5 h-1.5 rounded-full", PLATFORM_DOT[selectedTicket.platform] || "bg-sand-300")} />
                    <span className="text-sand-600 lowercase">{selectedTicket.platform.toLowerCase()}</span>
                  </span>
                </>
              )}
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] font-medium text-sand-500 mb-2">
                {t("tickets.changeStatus")}
              </p>
              <div className="inline-flex items-center gap-1 p-1 rounded-pill bg-sand-100 dark:bg-sand-900/40 border border-sand-200/70 dark:border-border">
                {["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => {
                  const active = selectedTicket.status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => handleChangeStatus(s)}
                      disabled={statusUpdating || active}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-pill transition-all duration-250 ease-sierra-out",
                        active
                          ? "bg-card text-sand-900 dark:text-foreground shadow-soft"
                          : "text-sand-600 hover:text-sand-900 dark:hover:text-foreground disabled:opacity-50",
                      )}
                    >
                      {statusLabel(s)}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedTicket.description && (
              <p className="text-sm text-sand-700 dark:text-foreground/80 leading-relaxed whitespace-pre-wrap">
                {selectedTicket.description}
              </p>
            )}

            {Array.isArray(selectedTicket.photos) && selectedTicket.photos.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] font-medium text-sand-500 mb-2">
                  {t("tickets.photos")}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {selectedTicket.photos.map((p: string, idx: number) => (
                    <a
                      key={idx}
                      href={photoUrl(p)}
                      target="_blank"
                      rel="noreferrer"
                      className="block aspect-square overflow-hidden rounded-lg border border-sand-200 hover:opacity-90 transition-opacity"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl(p)} alt="" className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {resolveOpen && (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-3">
                <p className="text-[11px] uppercase tracking-[0.12em] font-medium text-sand-700">
                  {t("tickets.resolutionNote")}
                </p>
                <textarea
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  dir="auto"
                  rows={3}
                  placeholder={t("tickets.resolutionPlaceholder")}
                  className="w-full px-3 py-2 rounded-xl bg-card border border-sand-200 text-sm focus:outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-250 resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setResolveOpen(false); setResolutionNote(""); }}
                    className="px-3 py-1.5 text-xs font-medium rounded-pill text-sand-600 hover:text-sand-900 transition-colors"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    onClick={handleResolve}
                    disabled={statusUpdating}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-pill bg-primary hover:bg-primary-hover text-white shadow-soft disabled:opacity-50 transition-all"
                  >
                    <Check size={12} /> {t("tickets.confirmResolve")}
                  </button>
                </div>
              </div>
            )}

            {selectedTicket.status === "RESOLVED" && selectedTicket.resolution && !resolveOpen && (
              <div className="rounded-xl border border-moss/30 bg-moss/5 dark:bg-moss/10 p-4 space-y-1.5">
                <p className="text-[11px] uppercase tracking-[0.12em] font-medium text-moss">
                  {t("tickets.resolutionNote")}
                </p>
                <p className="text-sm text-sand-800 dark:text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {selectedTicket.resolution}
                </p>
                {selectedTicket.resolvedAt && (
                  <p className="text-[11px] text-sand-500 pt-1">
                    {formatDateTime(selectedTicket.resolvedAt, locale)}
                  </p>
                )}
              </div>
            )}

            <div className="pt-5 border-t border-sand-200 dark:border-border space-y-2.5">
              <Row
                label={t("tickets.submittedBy")}
                value={selectedTicket.submitterDriver?.name || selectedTicket.submitterUser?.name || "—"}
              />
              <Row label={t("tickets.assignedTo")} value={selectedTicket.assignedTo?.name || t("tickets.unassigned")} />
              <Row label={t("tickets.created")} value={formatDateTime(selectedTicket.createdAt, locale)} />
              {selectedTicket.slaDeadline && (
                <Row label={t("tickets.sla")} value={formatDateTime(selectedTicket.slaDeadline, locale)} />
              )}
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.12em] font-medium text-sand-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-3 text-xs">
      <span className="text-sand-500">{label}</span>
      <span className="text-sand-900 dark:text-foreground font-medium text-end truncate">{value}</span>
    </div>
  );
}
