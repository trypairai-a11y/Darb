"use client";
// Darb 2.0 revision 15 (#2) — /requests: the HQ desk.
//
// The client asked two questions of the Setup screen: where do we see the
// support requests, and where do we approve the pricing a delivery company
// proposes. Both were already built and both were unreachable from here.
//
//   - Support tickets could only be read from inside the shop's own detail
//     panel or the delivery company's, so a request from an account nobody
//     opened that day was invisible. /api/support is the inbox across both.
//   - RATE_CHANGE approvals existed, but only in the panel that opens after
//     picking the right company out of the /fleets table, and the section
//     hides itself when that company has nothing pending. From the Setup
//     screen there was no sign the flow existed at all.
//
// So this is one screen with two tabs, and a Setup card that carries the count.
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileText, LifeBuoy, Store, Truck } from "lucide-react";
import BackToSetup from "@/components/shared/BackToSetup";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import { fleetsApi, supportApi, unwrapList } from "@/lib/darbApi";
import type { FleetChangeRequest, SupportTicket } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd } from "@/i18n/format";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

type Tab = "support" | "approvals";
const TABS: Tab[] = ["support", "approvals"];
const isTab = (v: string | null): v is Tab => !!v && (TABS as string[]).includes(v);

type SupportFilter = "waiting" | "RESOLVED" | "";

// ─── Support ────────────────────────────────────────────────────────────────

function SupportTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { canManageSettings } = useRole();
  const [filter, setFilter] = useState<SupportFilter>("waiting");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const ticketsQuery = useQuery({
    queryKey: ["darb", "support", filter],
    // "waiting" is the server's default (OPEN + ANSWERED), so it sends no
    // status at all rather than a value the endpoint would have to know.
    queryFn: () =>
      supportApi.list({ limit: 100, ...(filter === "waiting" ? {} : { status: filter }) }),
  });
  const tickets = useMemo(() => unwrapList<SupportTicket>(ticketsQuery.data), [ticketsQuery.data]);

  const replyMutation = useMutation({
    mutationFn: ({ id, body, resolve }: { id: string; body: string; resolve: boolean }) =>
      supportApi.reply(id, body, resolve),
    onSuccess: async (_data, vars) => {
      toast.success(t("hqRequests.replied"));
      setDraft((prev) => ({ ...prev, [vars.id]: "" }));
      await queryClient.invalidateQueries({ queryKey: ["darb", "support"] });
    },
    onError: (err: unknown) =>
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          t("toast.failedSave"),
      ),
    onSettled: () => setBusy(null),
  });

  const filters: Array<{ key: SupportFilter; label: string }> = [
    { key: "waiting", label: t("hqRequests.filterWaiting") },
    { key: "RESOLVED", label: t("hqRequests.filterResolved") },
    { key: "", label: t("hqRequests.filterAll") },
  ];

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

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit">
        {filters.map((f) => (
          <button
            key={f.key || "all"}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3.5 h-8 text-xs font-medium rounded-pill transition-colors",
              filter === f.key ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {tickets.length === 0 ? (
        <div
          data-testid="hq-support-empty"
          className="bg-card border border-sand-200 rounded-2xl shadow-soft p-8 text-center"
        >
          <p className="text-sm text-sand-600">{t("hqRequests.emptySupport")}</p>
        </div>
      ) : (
        <ul className="space-y-3" data-testid="hq-support-list">
          {tickets.map((ticket) => {
            const isFleet = !!ticket.fleet;
            const owner = ticket.fleet?.name ?? ticket.vendor?.name ?? t("hqRequests.noOne");
            const last = ticket.messages[ticket.messages.length - 1];
            return (
              <li
                key={ticket.id}
                className="bg-card border border-sand-200 rounded-2xl shadow-soft p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-sand-900" dir="auto">
                      {ticket.subject}
                    </p>
                    <p className="text-xs text-sand-600 mt-0.5 inline-flex items-center gap-1.5">
                      {isFleet ? (
                        <Truck size={12} aria-hidden="true" />
                      ) : (
                        <Store size={12} aria-hidden="true" />
                      )}
                      <span dir="auto">
                        {isFleet ? t("hqRequests.fromFleet") : t("hqRequests.fromShop")} · {owner}
                      </span>
                    </p>
                  </div>
                  <span className="text-xs text-sand-500">
                    {formatDateTime(ticket.updatedAt, locale)}
                  </span>
                </div>

                {last && (
                  <div className="rounded-xl bg-sand-100 px-3 py-2">
                    <p className="text-[11px] text-sand-500">
                      {last.author === "DARB" ? "Darb" : (last.authorName ?? owner)}
                    </p>
                    <p className="text-sm text-sand-800 whitespace-pre-wrap" dir="auto">
                      {last.body}
                    </p>
                  </div>
                )}

                {/* CANCELLED is the one state with no reply box: whoever raised
                    it withdrew it, and answering would overrule that. */}
                {canManageSettings && ticket.status !== "RESOLVED" && ticket.status !== "CANCELLED" && (
                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      dir="auto"
                      value={draft[ticket.id] ?? ""}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [ticket.id]: e.target.value }))}
                      placeholder={t("hqRequests.replyPlaceholder")}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy === ticket.id || (draft[ticket.id] ?? "").trim().length < 2}
                        onClick={() => {
                          setBusy(ticket.id);
                          replyMutation.mutate({
                            id: ticket.id,
                            body: (draft[ticket.id] ?? "").trim(),
                            resolve: false,
                          });
                        }}
                        className="btn-primary h-9 px-4 text-xs disabled:opacity-50"
                      >
                        {t("hqRequests.send")}
                      </button>
                      <button
                        type="button"
                        disabled={busy === ticket.id || (draft[ticket.id] ?? "").trim().length < 2}
                        onClick={() => {
                          setBusy(ticket.id);
                          replyMutation.mutate({
                            id: ticket.id,
                            body: (draft[ticket.id] ?? "").trim(),
                            resolve: true,
                          });
                        }}
                        className="h-9 px-4 rounded-pill border border-sand-300 bg-white text-xs font-medium text-sand-700 disabled:opacity-50"
                      >
                        {t("hqRequests.sendAndClose")}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Approvals ──────────────────────────────────────────────────────────────

function ApprovalsTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { canManageSettings } = useRole();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [openingDoc, setOpeningDoc] = useState<string | null>(null);

  /**
   * The signed URL is short-lived and minted per click, so it is fetched on
   * demand rather than rendered into an href that would be stale by the time
   * anyone pressed it.
   */
  async function openDocument(docId: string) {
    setOpeningDoc(docId);
    try {
      // Client note (2026-08-31): the file endpoint hands back the bytes when
      // R2 is unconfigured, a redirect to a signed URL when it is.
      const { objectUrl } = await fleetsApi.documentFile(docId);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          t("hqRequests.fileOpenFailed"),
      );
    } finally {
      setOpeningDoc(null);
    }
  }

  const requestsQuery = useQuery({
    queryKey: ["darb", "fleet-requests", "inbox"],
    queryFn: () => fleetsApi.requestsInbox({ status: "PENDING" }),
  });
  const requests = useMemo<FleetChangeRequest[]>(() => requestsQuery.data ?? [], [requestsQuery.data]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["darb", "fleet-requests"] });
    await queryClient.invalidateQueries({ queryKey: ["darb", "support", "counts"] });
    await queryClient.invalidateQueries({ queryKey: ["darb", "fleets"] });
  };

  const fail = (err: unknown) =>
    toast.error(
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave"),
    );

  async function approve(r: FleetChangeRequest) {
    setBusy(r.id);
    try {
      await fleetsApi.approveRequest(r.fleetPartnerId, r.id);
      toast.success(t("toast.saved"));
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function reject(r: FleetChangeRequest) {
    setBusy(r.id);
    try {
      await fleetsApi.rejectRequest(r.fleetPartnerId, r.id, reason.trim());
      toast.success(t("toast.saved"));
      setRejecting(null);
      setReason("");
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  if (requestsQuery.isLoading) return <PageSkeleton statCards={0} tableRows={4} tableCols={3} />;
  if (requestsQuery.error) {
    return (
      <ErrorState
        error={
          requestsQuery.error instanceof Error
            ? requestsQuery.error.message
            : t("errors.loadingData")
        }
        onRetry={() => requestsQuery.refetch()}
      />
    );
  }

  if (requests.length === 0) {
    return (
      <div
        data-testid="hq-approvals-empty"
        className="bg-card border border-sand-200 rounded-2xl shadow-soft p-8 text-center"
      >
        <p className="text-sm text-sand-600">{t("hqRequests.emptyApprovals")}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3" data-testid="hq-approvals-list">
      {requests.map((r) => {
        const payload = (r.payload ?? {}) as Record<string, any>;
        return (
          <li key={r.id} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
            <p className="text-sm font-medium text-sand-900 inline-flex items-center gap-1.5" dir="auto">
              <Truck size={13} aria-hidden="true" />
              {r.fleet?.name ?? t("hqRequests.fromFleet")}
            </p>
            <p className="text-sm text-sand-900 mt-1" dir="auto">
              {r.type.replace(/_/g, " ")}
              {r.driver?.name ? ` · ${r.driver.name}` : payload.name ? ` · ${payload.name}` : ""}
            </p>
            {/* Same two-number rule the per-company panel enforces: approving a
                bare "KD 1.400" with no sight of what it moves from is a
                supervisor guessing at the size of the raise. */}
            <p className="text-xs text-sand-600 mt-0.5" dir="auto">
              {r.type === "RATE_CHANGE"
                ? `${t("fleetPortal.rateBaseLabel")}: ${formatKwd(
                    payload.currentKwd ?? "0",
                    locale,
                  )} → ${formatKwd(payload.flatFeePerOrderKwd ?? "0", locale)}${
                    payload.perKmFeeKwd == null
                      ? ""
                      : ` · ${t("fleetPortal.ratePerKmLabel")}: ${formatKwd(
                          payload.currentPerKmKwd ?? "0",
                          locale,
                        )} → ${formatKwd(payload.perKmFeeKwd, locale)}`
                  }${payload.reason ? ` · ${payload.reason}` : ""}`
                : r.type === "DRIVER_ONBOARD"
                  ? `${payload.phone ?? ""} · ${payload.vehicleType ?? ""}`
                  : r.type === "DRIVER_STATUS"
                    ? `${payload.status ?? ""}${payload.reason ? ` · ${payload.reason}` : ""}`
                    : payload.documentType
                      ? String(payload.documentType).replace(/_/g, " ")
                      : ""}
            </p>

            {/* Client note, revision 16 (#1): approving a scan you cannot open is
                a rubber stamp. The reviewer read the document's LABEL and had no
                way through to the file. The staff read already returns the
                documents themselves, and /api/fleets/documents/:id/url already
                signs a short-lived GET for an ops user, so this is the affordance
                that was missing rather than a new capability. A document with no
                fileKey says so: the fleet submitted an expiry date with no file
                because object storage is not switched on yet, and a button that
                404s would read as a broken viewer instead of a missing upload. */}
            {!!r.documents?.length && (
              <ul className="mt-2 space-y-1.5" data-testid="hq-approval-documents">
                {r.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-2 flex-wrap">
                    <FileText size={13} className="text-sand-500 shrink-0" aria-hidden="true" />
                    <span className="text-xs text-sand-700" dir="auto">
                      {doc.fileName ?? doc.type.replace(/_/g, " ")}
                    </span>
                    {doc.fileKey || doc.hasFile ? (
                      <button
                        type="button"
                        data-testid="hq-view-document"
                        disabled={openingDoc === doc.id}
                        onClick={() => void openDocument(doc.id)}
                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-pill bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/15 disabled:opacity-50"
                      >
                        <Eye size={12} aria-hidden="true" />
                        {openingDoc === doc.id ? t("common.processing") : t("hqRequests.viewFile")}
                      </button>
                    ) : (
                      <span className="text-[11px] text-sand-500">{t("hqRequests.noFile")}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-sand-500 mt-0.5">
              {t("hqRequests.raisedBy")}{" "}
              {r.requestedBy?.name ?? r.requestedBy?.email ?? t("hqRequests.noOne")} ·{" "}
              {formatDateTime(r.createdAt, locale)}
            </p>

            {canManageSettings &&
              (rejecting === r.id ? (
                <div className="mt-2.5 space-y-2">
                  <input
                    className="w-full px-3 h-9 rounded-xl bg-white border border-sand-300 text-sm"
                    placeholder={t("fleetPortal.darbNote")}
                    value={reason}
                    dir="auto"
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy === r.id || reason.trim().length < 5}
                      onClick={() => reject(r)}
                      className="h-9 px-3 rounded-pill bg-red-600 text-white text-xs font-medium disabled:opacity-50"
                    >
                      {t("common.confirm")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejecting(null);
                        setReason("");
                      }}
                      className="h-9 px-3 rounded-pill border border-sand-300 bg-white text-xs text-sand-700"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-2.5">
                  <button
                    type="button"
                    data-testid="hq-approve"
                    disabled={busy === r.id}
                    onClick={() => approve(r)}
                    className="h-9 px-3 rounded-pill bg-primary text-white text-xs font-medium disabled:opacity-50"
                  >
                    {t("common.approve")}
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => {
                      setRejecting(r.id);
                      setReason("");
                    }}
                    className="h-9 px-3 rounded-pill border border-sand-300 bg-white text-xs font-medium text-sand-700"
                  >
                    {t("common.reject")}
                  </button>
                </div>
              ))}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

function RequestsScreen() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const { canManageSettings } = useRole();
  const [tab, setTab] = useState<Tab>(() => {
    const requested = searchParams.get("tab");
    return isTab(requested) ? requested : "support";
  });

  const countsQuery = useQuery({
    queryKey: ["darb", "support", "counts"],
    queryFn: () => supportApi.counts(),
  });

  // Mirrors the rail's own gate for anyone arriving by URL, the way /setup does.
  if (!canManageSettings) {
    return (
      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-8 text-center">
        <p className="text-sm text-sand-600">{t("errors.permissionDenied")}</p>
      </div>
    );
  }

  const counts = countsQuery.data;
  const badge: Record<Tab, number | null> = {
    support: counts?.openSupport ?? null,
    approvals: counts?.pendingApprovals ?? null,
  };
  const labels: Record<Tab, string> = {
    support: t("hqRequests.tabSupport"),
    approvals: t("hqRequests.tabApprovals"),
  };

  return (
    <div className="space-y-6">
      <BackToSetup />
      <div>
        <h1 className="font-display text-display-sm text-sand-900 inline-flex items-center gap-2">
          <LifeBuoy size={22} aria-hidden="true" />
          {t("hqRequests.title")}
        </h1>
        <p className="text-sm text-sand-600 mt-1">{t("hqRequests.subtitle")}</p>
      </div>

      <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit flex-wrap">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "px-4 h-9 text-sm font-medium rounded-pill transition-colors inline-flex items-center gap-2",
              tab === key ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900",
            )}
          >
            {labels[key]}
            {!!badge[key] && (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-pill bg-clay text-white text-[11px]">
                {badge[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "support" ? <SupportTab /> : <ApprovalsTab />}
    </div>
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={<PageSkeleton statCards={0} tableRows={4} tableCols={3} />}>
      <RequestsScreen />
    </Suspense>
  );
}
