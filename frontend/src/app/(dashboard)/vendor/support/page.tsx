"use client";
// Darb 2.0 — /vendor/support: the shop's requests to Darb. Revision 8 (#6).
//
// Open to all three shop roles. Order tracking especially: following
// deliveries and reporting when one goes wrong is that role's whole job, and
// it can see neither money nor settings, so this is its only channel.
//
// A thread rather than a form that swallows things: the shop sees what it
// asked, what Darb answered, and whether the matter is closed.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Send, XCircle } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import ConfirmModal from "@/components/shared/ConfirmModal";
import SlidePanel from "@/components/shared/SlidePanel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import { vendorApi } from "@/lib/darbApi";
import type { SupportTicket, SupportTicketStatus, SupportTicketType } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime } from "@/i18n/format";
import { cn } from "@/lib/cn";

const inputClass =
  "w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function VendorSupportPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ticketType, setTicketType] = useState<SupportTicketType>("ORDER");
  const [filter, setFilter] = useState<SupportTicketType | "ALL">("ALL");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  // Revision 10 (#5). A shop that sorted something out itself had no way to say
  // so: the request sat waiting on Darb until somebody answered a question
  // nobody needed answering.
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const ticketsQuery = useQuery({
    queryKey: ["darb", "vendor", "support"],
    queryFn: () => vendorApi.support(),
    refetchInterval: 60_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["darb", "vendor", "support"] });

  const fail = (err: unknown) =>
    toast.error(
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave")
    );

  async function raise() {
    setSaving(true);
    try {
      await vendorApi.createTicket({ type: ticketType, subject: subject.trim(), body: body.trim() });
      toast.success(t("vendorSupport.raised"));
      setOpen(false);
      setSubject("");
      setBody("");
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function cancelTicket(id: string) {
    setSaving(true);
    try {
      await vendorApi.cancelTicket(id, cancelReason.trim() || undefined);
      toast.success(t("vendorSupport.cancelDone"));
      setCancelId(null);
      setCancelReason("");
      await refresh();
    } catch (err) {
      fail(err);
      // Darb closing it first is a 409, and the board is now out of date. Close
      // the dialog and refetch so the shop sees what actually happened.
      setCancelId(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function sendReply(id: string) {
    if (reply.trim() === "") return;
    setSaving(true);
    try {
      await vendorApi.replyToTicket(id, reply.trim());
      setReply("");
      setReplyTo(null);
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  if (ticketsQuery.isLoading) return <PageSkeleton statCards={0} tableRows={4} tableCols={3} />;
  if (ticketsQuery.error) {
    return (
      <ErrorState
        error={
          ticketsQuery.error instanceof Error ? ticketsQuery.error.message : t("errors.loadingData")
        }
        onRetry={() => ticketsQuery.refetch()}
      />
    );
  }

  const all = ticketsQuery.data ?? [];
  const tickets = filter === "ALL" ? all : all.filter((x) => x.type === filter);
  const statusLabel = (s: SupportTicketStatus) =>
    s === "RESOLVED"
      ? t("vendorSupport.statusResolved")
      : s === "CANCELLED"
        ? t("vendorSupport.statusCancelled")
        : s === "ANSWERED"
          ? t("vendorSupport.statusAnswered")
          : t("vendorSupport.statusOpen");
  // Only a live request can be withdrawn. Resolved means Darb closed it, and
  // cancelled is already this.
  const canCancel = (s: SupportTicketStatus) => s === "OPEN" || s === "ANSWERED";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-sm text-sand-900">{t("vendorSupport.title")}</h1>
          <p className="text-sm text-sand-600 mt-1">{t("vendorSupport.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 h-10 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          <MessageSquarePlus size={15} aria-hidden="true" />
          {t("vendorSupport.raise")}
        </button>
      </div>

      {/* Revision 9 (#6). Four kinds, and a shop with a payment query should
          not have to read past a week of delivery complaints to find it. */}
      <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit flex-wrap">
        {(["ALL", "ORDER", "WALLET", "TECHNICAL", "OTHER"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "px-4 h-9 text-sm font-medium rounded-pill transition-colors",
              filter === key ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900"
            )}
          >
            {key === "ALL" ? t("vendorSupport.typeALL") : t(`vendorSupport.type${key}`)}
          </button>
        ))}
      </div>

      {tickets.length === 0 ? (
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft px-5 py-12 text-center">
          <p className="text-sm text-sand-600">{t("vendorSupport.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket: SupportTicket) => (
            <section
              key={ticket.id}
              className="bg-card border border-sand-200 rounded-2xl shadow-soft"
            >
              <header className="px-5 py-4 border-b border-sand-200 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium text-sand-900" dir="auto">
                    {ticket.subject}
                  </p>
                  <p className="text-xs text-sand-500 mt-0.5" dir="ltr">
                    {formatDateTime(ticket.createdAt, locale)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-pill bg-sand-100 text-sand-700 text-[11px] font-medium uppercase tracking-wide">
                    {t(`vendorSupport.type${ticket.type}`)}
                  </span>
                  <StatusBadge status={ticket.status} label={statusLabel(ticket.status)} />
                </div>
              </header>

              <div className="p-5 space-y-3">
                {ticket.messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-xl px-4 py-3 text-sm max-w-[46rem]",
                      // Darb's replies sit on the accent side so a shop can see
                      // at a glance whether anyone has answered yet.
                      m.author === "DARB"
                        ? "bg-primary-soft border border-primary/15 text-sand-900"
                        : "bg-sand-100 text-sand-800 ms-auto"
                    )}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-sand-500 mb-1">
                      {m.author === "DARB" ? t("vendorSupport.fromDarb") : t("vendorSupport.fromYou")}
                    </p>
                    <p dir="auto" className="whitespace-pre-wrap">
                      {m.body}
                    </p>
                  </div>
                ))}

                {canCancel(ticket.status) && (
                  <div className="pt-1 flex items-center justify-between gap-3 flex-wrap">
                    {replyTo === ticket.id ? (
                      <div className="flex items-end gap-2">
                        <textarea
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          rows={2}
                          autoFocus
                          className="flex-1 px-3 py-2 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <button
                          type="button"
                          disabled={saving || reply.trim() === ""}
                          onClick={() => void sendReply(ticket.id)}
                          className="inline-flex items-center gap-1.5 px-4 h-10 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                        >
                          <Send size={13} aria-hidden="true" />
                          {t("vendorSupport.send")}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setReplyTo(ticket.id)}
                        className="text-xs text-primary hover:underline"
                      >
                        {t("vendorSupport.addReply")}
                      </button>
                    )}
                    {/* Quiet, on the far side of the row: withdrawing a request
                        is a real action but not the one a shop opening this
                        screen is usually here to take. */}
                    {replyTo !== ticket.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setCancelReason("");
                          setCancelId(ticket.id);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs text-sand-600 hover:text-red-700 transition-colors"
                      >
                        <XCircle size={13} aria-hidden="true" />
                        {t("vendorSupport.cancelTicket")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <ConfirmModal
        open={cancelId !== null}
        title={t("vendorSupport.cancelTitle")}
        message={t("vendorSupport.cancelMessage")}
        variant="danger"
        confirmLabel={t("vendorSupport.cancelConfirm")}
        cancelLabel={t("vendorSupport.cancelKeep")}
        loading={saving}
        onConfirm={() => {
          if (cancelId) void cancelTicket(cancelId);
        }}
        onCancel={() => setCancelId(null)}
      >
        <div>
          <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
            {t("vendorSupport.cancelReason")}
          </label>
          <textarea
            dir="auto"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full px-3 py-2 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </ConfirmModal>

      <SlidePanel open={open} onClose={() => setOpen(false)} title={t("vendorSupport.raise")}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              {t("vendorSupport.type")} *
            </label>
            <select
              value={ticketType}
              onChange={(e) => setTicketType(e.target.value as SupportTicketType)}
              className={inputClass}
            >
              <option value="ORDER">{t("vendorSupport.typeORDER")}</option>
              <option value="WALLET">{t("vendorSupport.typeWALLET")}</option>
              <option value="TECHNICAL">{t("vendorSupport.typeTECHNICAL")}</option>
              <option value="OTHER">{t("vendorSupport.typeOTHER")}</option>
            </select>
            <p className="mt-1.5 text-xs text-sand-600">{t(`vendorSupport.hint${ticketType}`)}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              {t("vendorSupport.subject")} *
            </label>
            <input
              dir="auto"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputClass}
              maxLength={200}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
              {t("vendorSupport.details")} *
            </label>
            <textarea
              dir="auto"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={4000}
              className="w-full px-3 py-2 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-1.5 text-xs text-sand-600">{t("vendorSupport.detailsHint")}</p>
          </div>
          <button
            type="button"
            disabled={saving || subject.trim() === "" || body.trim() === ""}
            onClick={() => void raise()}
            className="w-full h-11 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {saving ? t("common.processing") : t("vendorSupport.raise")}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}
