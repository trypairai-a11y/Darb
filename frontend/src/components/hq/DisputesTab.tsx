"use client";
// Revision 20 — Finance › Disputes.
//
// "this tab is where the finance team will receive the disputes and communicate
// with vendor/delivery company".
//
// A dispute is already two rows: the payout statement somebody disagreed with,
// and the SupportTicket carrying the conversation about it (revision 13 #8 made
// a dispute open one deliberately, so the disagreement lands in the inbox Darb
// triages rather than in a WhatsApp thread). This screen joins them, so the
// number being argued about and the argument are on the same card.
//
// Replying uses the existing support endpoint, which is the same one the
// shop's and the company's own portals read. There is no second message store.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Store, Truck } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import { financeDeskApi, supportApi } from "@/lib/darbApi";
import type { SupportTicket } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate, formatDateTime, formatKwd } from "@/i18n/format";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

/** The reply box under one thread. Shared by both halves of the screen. */
function ReplyBox({
  ticket,
  onReplied,
  canReply,
}: {
  ticket: SupportTicket;
  onReplied: () => void;
  canReply: boolean;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [body, setBody] = useState("");

  const replyMutation = useMutation({
    mutationFn: (resolve: boolean) => supportApi.reply(ticket.id, body.trim(), resolve),
    onSuccess: () => {
      toast.success(t("financeDesk.replied"));
      setBody("");
      onReplied();
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message ?? t("errors.savingData"));
    },
  });

  return (
    <div className="mt-3 border-t border-sand-100 pt-3 space-y-2">
      {(ticket.messages ?? []).length > 0 && (
        <ul className="space-y-2 max-h-56 overflow-y-auto">
          {(ticket.messages ?? []).map((m) => (
            <li
              key={m.id}
              className={cn(
                "rounded-2xl px-3 py-2 text-sm",
                m.author === "DARB" ? "bg-primary/5 text-sand-800" : "bg-sand-50 text-sand-800",
              )}
            >
              <p className="text-[11px] text-sand-500 mb-0.5">
                {m.authorName ?? m.author} · {formatDateTime(m.createdAt, locale)}
              </p>
              {m.body}
            </li>
          ))}
        </ul>
      )}
      {canReply && (
        <>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder={t("financeDesk.replyPlaceholder")}
            className="w-full rounded-2xl border border-sand-200 bg-card p-3 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!body.trim() || replyMutation.isPending}
              onClick={() => replyMutation.mutate(false)}
              className="h-9 px-4 rounded-pill bg-primary text-white text-xs font-medium disabled:opacity-40"
            >
              {t("financeDesk.send")}
            </button>
            <button
              type="button"
              disabled={!body.trim() || replyMutation.isPending}
              onClick={() => replyMutation.mutate(true)}
              className="h-9 px-4 rounded-pill border border-sand-200 text-sand-700 text-xs font-medium disabled:opacity-40"
            >
              {t("financeDesk.sendAndResolve")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function DisputesTab() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const { hasRole } = useRole();
  const canReply = hasRole("ACCOUNTANT");
  const [showAll, setShowAll] = useState(false);

  const query = useQuery({
    queryKey: ["darb", "disputes", showAll],
    queryFn: () => financeDeskApi.disputes(showAll ? { status: "ALL" } : undefined),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["darb", "disputes"] });
  }

  if (query.isLoading) return <PageSkeleton statCards={0} tableRows={5} tableCols={4} />;
  if (query.error) {
    return (
      <ErrorState
        error={query.error instanceof Error ? query.error.message : t("errors.loadingData")}
        onRetry={() => query.refetch()}
      />
    );
  }

  const statements = query.data?.statements ?? [];
  // A ticket that already appears under its statement is not listed twice.
  const attached = new Set(statements.map((s) => s.ticket?.id).filter(Boolean));
  const tickets = (query.data?.tickets ?? []).filter((tk) => !attached.has(tk.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-sand-900">{t("financeDesk.disputesTitle")}</h2>
          <p className="text-sm text-sand-600 mt-1">{t("financeDesk.disputesSubtitle")}</p>
        </div>
        <div className="flex gap-1 bg-sand-100 rounded-pill p-1">
          {[false, true].map((all) => (
            <button
              key={String(all)}
              type="button"
              onClick={() => setShowAll(all)}
              className={cn(
                "px-4 h-8 text-sm font-medium rounded-pill transition-colors",
                showAll === all ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900",
              )}
            >
              {t(all ? "financeDesk.showAll" : "financeDesk.showPending")}
            </button>
          ))}
        </div>
      </div>

      {statements.length === 0 && tickets.length === 0 && (
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-10 text-center">
          <p className="text-sm text-sand-500">{t("financeDesk.noDisputes")}</p>
        </div>
      )}

      {/* ── Disputed payouts ────────────────────────────────────────────── */}
      {statements.map((st) => (
        <div key={st.id} className="bg-card border border-sand-200 rounded-2xl shadow-soft p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Truck size={15} className="text-sand-400" aria-hidden="true" />
                <p className="font-medium text-sand-900">{st.fleetPartnerName ?? "n/a"}</p>
                <span className="px-2 h-6 inline-flex items-center rounded-pill bg-red-100 text-red-700 text-[11px] font-medium">
                  {t("financeDesk.disputedStatement")}
                </span>
              </div>
              <p className="text-sm text-sand-600 mt-1">
                {t("financeDesk.period")}: {formatDate(st.periodStart, locale)} —{" "}
                {formatDate(st.periodEnd, locale)}
                {" · "}
                {st.deliveredOrders} orders
              </p>
            </div>
            <div className="text-end">
              <p className="font-display text-lg text-sand-900 tabular-nums">
                {formatKwd(st.netPayableKwd ?? st.totalKwd, locale)}
              </p>
              {st.disputedAt && (
                <p className="text-xs text-sand-500">{formatDateTime(st.disputedAt, locale)}</p>
              )}
            </div>
          </div>

          {st.disputeReason && (
            <p className="mt-3 text-sm text-sand-800 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2">
              <span className="font-medium">{t("financeDesk.reason")}: </span>
              {st.disputeReason}
            </p>
          )}

          {st.ticket ? (
            <ReplyBox ticket={st.ticket} onReplied={refresh} canReply={canReply} />
          ) : (
            // Statements disputed before revision 13 (#8) carry no ticket, so
            // there is no thread to reply into. Saying so beats an empty box.
            <p className="mt-3 text-xs text-sand-500">n/a</p>
          )}
        </div>
      ))}

      {/* ── Money questions raised directly ─────────────────────────────── */}
      {tickets.length > 0 && (
        <>
          <h3 className="font-display text-base text-sand-900 pt-2">
            {t("financeDesk.openTickets")}
          </h3>
          {tickets.map((tk) => (
            <div key={tk.id} className="bg-card border border-sand-200 rounded-2xl shadow-soft p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {tk.vendor ? (
                    <Store size={15} className="text-sand-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <Truck size={15} className="text-sand-400 shrink-0" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-sand-900 truncate">{tk.subject}</p>
                    <p className="text-xs text-sand-500">
                      {tk.vendor?.name ?? tk.fleet?.name ?? "n/a"} ·{" "}
                      {formatDateTime(tk.createdAt, locale)}
                    </p>
                  </div>
                </div>
                <span className="px-2 h-6 inline-flex items-center gap-1 rounded-pill bg-sand-100 text-sand-700 text-[11px] font-medium shrink-0">
                  <MessageSquare size={11} aria-hidden="true" />
                  {tk.status}
                </span>
              </div>
              <ReplyBox ticket={tk} onReplied={refresh} canReply={canReply} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
