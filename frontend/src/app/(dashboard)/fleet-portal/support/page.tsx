"use client";
// Darb 2.0 revision 12 — /fleet-portal/support: the delivery company's channel
// to Darb, and the mirror of the merchant portal's support tab.
//
// Issues flow Darb -> fleet. Support flows fleet -> Darb. Two tabs because
// they are two different jobs; one SupportTicket table underneath because Darb
// triages one inbox.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Send, XCircle } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import { fleetApi } from "@/lib/darbApi";
import type { SupportTicketType } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime } from "@/i18n/format";
import { cn } from "@/lib/cn";

const inputClass =
  "w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";
const areaClass =
  "w-full px-3 py-2 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function FleetSupportPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<SupportTicketType>("TECHNICAL");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const ticketsQuery = useQuery({
    queryKey: ["darb", "fleet", "support"],
    queryFn: () => fleetApi.support(),
    refetchInterval: 60_000,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "support"] });

  const fail = (err: unknown) =>
    toast.error(
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave"),
    );

  async function raise() {
    setSaving(true);
    try {
      await fleetApi.createTicket({ type, subject: subject.trim(), body: body.trim() });
      toast.success(t("fleetPortal.requestRaised"));
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

  async function sendReply(id: string) {
    if (reply.trim().length < 2) return;
    try {
      await fleetApi.replyTicket(id, reply.trim());
      setReply("");
      setReplyTo(null);
      await refresh();
    } catch (err) {
      fail(err);
    }
  }

  async function cancel(id: string) {
    try {
      await fleetApi.cancelTicket(id);
      await refresh();
    } catch (err) {
      fail(err);
    }
  }

  if (ticketsQuery.isLoading) return <PageSkeleton statCards={0} tableRows={5} tableCols={1} />;
  if (ticketsQuery.error) {
    return (
      <ErrorState
        error={
          ticketsQuery.error instanceof Error
            ? ticketsQuery.error.message
            : t("errors.loadingData")
        }
        onRetry={() => ticketsQuery.refetch()}
      />
    );
  }

  const tickets = ticketsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-sm text-sand-900">
            {t("fleetPortal.supportTitle")}
          </h1>
          <p className="text-sm text-sand-600 mt-1">{t("fleetPortal.supportSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-primary text-white text-sm font-medium hover:opacity-90"
        >
          <MessageSquarePlus size={16} aria-hidden="true" />
          {t("fleetPortal.newRequest")}
        </button>
      </div>

      {tickets.length === 0 ? (
        <p className="px-4 py-6 rounded-xl border border-sand-200 bg-white text-sm text-sand-600">
          {t("fleetPortal.noTickets")}
        </p>
      ) : (
        <ul className="space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="rounded-xl border border-sand-200 bg-white px-4 py-3.5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-sand-900" dir="auto">
                    {ticket.subject}
                  </p>
                  <p className="text-xs text-sand-500 mt-0.5">
                    {formatDateTime(ticket.createdAt, locale)}
                  </p>
                </div>
                <StatusBadge status={ticket.status} />
              </div>

              <ul className="mt-3 space-y-2">
                {(ticket.messages ?? []).map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      "rounded-xl px-3 py-2 text-sm",
                      m.author === "DARB"
                        ? "bg-forest-50 text-forest-900"
                        : "bg-sand-100 text-sand-800",
                    )}
                    dir="auto"
                  >
                    <p className="text-xs text-sand-500 mb-0.5">
                      {m.author === "DARB" ? "Darb" : m.authorName || "n/a"}
                    </p>
                    {m.body}
                  </li>
                ))}
              </ul>

              {ticket.status !== "RESOLVED" && ticket.status !== "CANCELLED" && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {replyTo === ticket.id ? (
                    <>
                      <input
                        className={inputClass}
                        style={{ flex: "1 1 12rem" }}
                        value={reply}
                        dir="auto"
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") sendReply(ticket.id); }}
                      />
                      <button
                        type="button"
                        onClick={() => sendReply(ticket.id)}
                        className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full bg-primary text-white text-xs font-medium"
                      >
                        <Send size={13} aria-hidden="true" />
                        {t("fleetPortal.send")}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setReplyTo(ticket.id); setReply(""); }}
                      className="h-9 px-3 rounded-full border border-sand-300 text-xs font-medium text-sand-700 hover:bg-sand-100"
                    >
                      {t("fleetPortal.reply")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => cancel(ticket.id)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-sand-300 text-xs font-medium text-sand-700 hover:bg-sand-100"
                  >
                    <XCircle size={13} aria-hidden="true" />
                    {t("fleetPortal.cancelRequest")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <SlidePanel open={open} onClose={() => setOpen(false)} title={t("fleetPortal.newRequest")}>
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-sand-700">{t("fleetPortal.documentType")}</span>
            <select
              className={inputClass}
              value={type}
              onChange={(e) => setType(e.target.value as SupportTicketType)}
            >
              <option value="TECHNICAL">TECHNICAL</option>
              <option value="ORDER">ORDER</option>
              <option value="WALLET">WALLET</option>
              <option value="OTHER">OTHER</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sand-700">{t("fleetPortal.subject")}</span>
            <input
              className={inputClass}
              value={subject}
              dir="auto"
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-sand-700">{t("fleetPortal.message")}</span>
            <textarea
              rows={5}
              className={areaClass}
              value={body}
              dir="auto"
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={saving || subject.trim().length < 3 || body.trim().length < 5}
            onClick={raise}
            className="w-full h-10 rounded-full bg-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {t("fleetPortal.send")}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}
