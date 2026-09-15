"use client";
// Revision 20 — Compliance › Driver documents, and Compliance › Shop and
// company documents. One component, two scopes, because the client described
// the second as "same idea in the driver documents but for vendors/delivery
// companies documents" and a second copy would have drifted the first time
// somebody changed the reject flow.
//
// "whenever a new driver document is uploaded, the system will verify the
// documents first after that the compliance team will either approve or
// reject the document, also the compliance team should be able to ask for
// extra documents from this subtab".
//
// The machine's verdict is a chip on the row, never a decision. It sorts the
// queue and says what to look at first. A checker that could reject on its own
// would reject a valid licence for being a photo of a photocopy and nobody
// would ever see it, which is why the only two buttons here are human ones.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, FileQuestion, RefreshCw, Search, TriangleAlert } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import { useToast } from "@/components/shared/Toast";
import { complianceApi, unwrapList } from "@/lib/darbApi";
import type { ComplianceDocStatus, ComplianceDocument, DocScope } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDate, formatDateTime } from "@/i18n/format";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

const STATUS_TONE: Record<ComplianceDocStatus, string> = {
  REQUESTED: "bg-amber-100 text-amber-700",
  PENDING_REVIEW: "bg-primary/10 text-primary",
  VALID: "bg-forest-100 text-forest-700",
  REJECTED: "bg-red-100 text-red-700",
  EXPIRED: "bg-red-100 text-red-700",
  SUPERSEDED: "bg-sand-200 text-sand-600",
};

/** A stored document type turned into something a person reads. */
function humanType(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ComplianceDocumentsTab({ scope }: { scope: "DRIVER" | "PARTNER" }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useRole();
  // The endpoint gates on the COMPLIANCE surface, which a per-user grant can
  // hand to a VIEWER. The role check here is only the coarse first pass; a
  // refused write still comes back as a 403 the toast shows.
  const canDecide = hasRole("SUPERVISOR");

  // The partner subtab is two server scopes — a shop's paper and a delivery
  // company's — shown together, because a compliance officer works "who owes
  // me a document" and not "which table is it in".
  const [partnerScope, setPartnerScope] = useState<DocScope>("VENDOR");
  const serverScope: DocScope = scope === "DRIVER" ? "DRIVER" : partnerScope;

  const [status, setStatus] = useState<string>("PENDING_REVIEW");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [q, setQ] = useState("");

  const [rejecting, setRejecting] = useState<ComplianceDocument | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [asking, setAsking] = useState(false);
  const [askType, setAskType] = useState("");
  const [askOwnerId, setAskOwnerId] = useState("");
  const [askNote, setAskNote] = useState("");

  const docsQuery = useQuery({
    queryKey: ["darb", "compliance", "documents", serverScope, status, flaggedOnly, q],
    queryFn: () =>
      complianceApi.documents({
        scope: serverScope,
        ...(status ? { status } : {}),
        ...(flaggedOnly ? { flagged: true } : {}),
        ...(q.trim() ? { q: q.trim() } : {}),
        limit: 100,
      }),
  });
  const docs = useMemo(() => unwrapList<ComplianceDocument>(docsQuery.data), [docsQuery.data]);

  const typesQuery = useQuery({
    queryKey: ["darb", "compliance", "doc-types", serverScope],
    queryFn: () => complianceApi.docTypes(serverScope),
    enabled: asking,
  });
  const accountsQuery = useQuery({
    queryKey: ["darb", "compliance", "accounts"],
    queryFn: () => complianceApi.accounts(),
    enabled: asking,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["darb", "compliance"] });
  }
  function failWith(err: unknown) {
    const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
    toast.error(message ?? t("errors.savingData"));
  }

  const approveMutation = useMutation({
    mutationFn: (id: string) => complianceApi.approve(id),
    onSuccess: () => {
      toast.success(t("compliance.approved"));
      refresh();
    },
    onError: failWith,
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => complianceApi.reject(id, rejectReason.trim()),
    onSuccess: () => {
      toast.success(t("compliance.rejected"));
      setRejecting(null);
      setRejectReason("");
      refresh();
    },
    onError: failWith,
  });
  const recheckMutation = useMutation({
    mutationFn: (id: string) => complianceApi.recheck(id),
    onSuccess: refresh,
    onError: failWith,
  });
  const askMutation = useMutation({
    mutationFn: () =>
      complianceApi.requestDocument({
        scope: serverScope,
        type: askType,
        ...(askNote.trim() ? { note: askNote.trim() } : {}),
        ...(serverScope === "DRIVER" ? { driverId: askOwnerId } : {}),
        ...(serverScope === "COMPANY" ? { fleetPartnerId: askOwnerId } : {}),
        ...(serverScope === "VENDOR" ? { vendorId: askOwnerId } : {}),
      }),
    onSuccess: () => {
      toast.success(t("compliance.requestSent"));
      setAsking(false);
      setAskType("");
      setAskOwnerId("");
      setAskNote("");
      refresh();
    },
    onError: failWith,
  });

  const owners =
    serverScope === "DRIVER"
      ? (accountsQuery.data?.drivers ?? []).map((d) => ({
          id: d.id,
          label: `${d.name}${d.driverCode ? ` (${d.driverCode})` : ""}`,
        }))
      : serverScope === "COMPANY"
        ? (accountsQuery.data?.fleets ?? []).map((f) => ({ id: f.id, label: f.name }))
        : (accountsQuery.data?.vendors ?? []).map((v) => ({ id: v.id, label: v.name }));

  if (docsQuery.isLoading) return <PageSkeleton statCards={0} tableRows={6} tableCols={6} />;
  if (docsQuery.error) {
    return (
      <ErrorState
        error={docsQuery.error instanceof Error ? docsQuery.error.message : t("errors.loadingData")}
        onRetry={() => docsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {scope === "PARTNER" && (
          <div className="flex gap-1 bg-sand-100 rounded-pill p-1">
            {(["VENDOR", "COMPANY"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPartnerScope(s)}
                className={cn(
                  "px-4 h-8 text-sm font-medium rounded-pill transition-colors",
                  partnerScope === s
                    ? "bg-white text-sand-900 shadow-soft"
                    : "text-sand-600 hover:text-sand-900",
                )}
              >
                {t(s === "VENDOR" ? "compliance.scopeVENDOR" : "compliance.scopeCOMPANY")}
              </button>
            ))}
          </div>
        )}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 px-3 rounded-pill border border-sand-200 bg-card text-sm"
        >
          {(["PENDING_REVIEW", "REQUESTED", "VALID", "REJECTED", "EXPIRED", ""] as const).map((s) => (
            <option key={s || "all"} value={s}>
              {s ? t(`compliance.status${s}`) : t("labels.all")}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 h-9 px-3 rounded-pill border border-sand-200 bg-card text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={(e) => setFlaggedOnly(e.target.checked)}
            className="accent-primary"
          />
          {t("compliance.flaggedOnly")}
        </label>
        <div className="relative">
          <Search
            size={14}
            className="absolute start-3 top-1/2 -translate-y-1/2 text-sand-400"
            aria-hidden="true"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("common.search")}
            className="h-9 ps-8 pe-3 w-52 rounded-pill border border-sand-200 bg-card text-sm"
          />
        </div>
        {canDecide && (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="h-9 px-4 ms-auto inline-flex items-center gap-2 rounded-pill bg-primary text-white text-sm font-medium"
          >
            <FileQuestion size={14} aria-hidden="true" />
            {t("compliance.requestDocument")}
          </button>
        )}
      </div>

      {/* ── The queue ───────────────────────────────────────────────────── */}
      {docs.length === 0 ? (
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-10 text-center">
          <p className="text-sm text-sand-500">{t("compliance.empty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => {
            const owner = doc.driver?.name ?? doc.vendor?.name ?? doc.fleet?.name ?? "n/a";
            const ownerRef =
              doc.driver?.driverCode ?? doc.fleet?.name ?? doc.vendor?.name ?? null;
            const notes = doc.autoCheckNotes ?? [];
            return (
              <div
                key={doc.id}
                className="bg-card border border-sand-200 rounded-2xl shadow-soft p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-sand-900">{humanType(doc.type)}</p>
                      <span
                        className={cn(
                          "px-2 h-6 inline-flex items-center rounded-pill text-[11px] font-medium",
                          STATUS_TONE[doc.status],
                        )}
                      >
                        {t(`compliance.status${doc.status}`)}
                      </span>
                      {/* The machine's verdict, as a chip. Never a decision. */}
                      {doc.autoCheck === "PASS" && (
                        <span className="px-2 h-6 inline-flex items-center gap-1 rounded-pill bg-forest-50 text-forest-700 text-[11px]">
                          <CircleCheck size={11} aria-hidden="true" />
                          {t("compliance.autoPass")}
                        </span>
                      )}
                      {doc.autoCheck === "FLAG" && (
                        <span className="px-2 h-6 inline-flex items-center gap-1 rounded-pill bg-amber-50 text-amber-700 text-[11px]">
                          <TriangleAlert size={11} aria-hidden="true" />
                          {t("compliance.autoFlag")}
                        </span>
                      )}
                      {doc.autoCheck === null && (
                        <span className="px-2 h-6 inline-flex items-center rounded-pill bg-sand-100 text-sand-600 text-[11px]">
                          {t("compliance.autoPending")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-sand-600 mt-1">
                      {owner}
                      {ownerRef && ownerRef !== owner ? ` · ${ownerRef}` : ""}
                      {doc.driver?.isFrozen ? ` · ${t("compliance.frozen")}` : ""}
                    </p>
                    <p className="text-xs text-sand-500 mt-0.5">
                      {doc.expiryDate
                        ? `${t("compliance.expiry")}: ${formatDate(doc.expiryDate, locale)}`
                        : t("compliance.checkNO_EXPIRY")}
                      {" · "}
                      {t("compliance.uploaded")}: {formatDateTime(doc.createdAt, locale)}
                      {!doc.hasFile ? ` · ${t("compliance.noFile")}` : ""}
                    </p>
                  </div>

                  {canDecide && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title={t("compliance.recheck")}
                        onClick={() => recheckMutation.mutate(doc.id)}
                        className="h-9 w-9 rounded-pill grid place-items-center text-sand-500 hover:bg-sand-100"
                      >
                        <RefreshCw size={15} aria-hidden="true" />
                      </button>
                      {doc.status !== "VALID" && doc.status !== "REQUESTED" && (
                        <button
                          type="button"
                          disabled={approveMutation.isPending}
                          onClick={() => approveMutation.mutate(doc.id)}
                          className="h-9 px-4 inline-flex items-center gap-1.5 rounded-pill bg-forest-600 text-white text-xs font-medium disabled:opacity-40"
                        >
                          <CircleCheck size={14} aria-hidden="true" />
                          {t("compliance.approve")}
                        </button>
                      )}
                      {doc.status !== "REJECTED" && doc.status !== "REQUESTED" && (
                        <button
                          type="button"
                          onClick={() => {
                            setRejecting(doc);
                            setRejectReason("");
                          }}
                          className="h-9 px-4 inline-flex items-center gap-1.5 rounded-pill border border-sand-200 text-sand-700 text-xs font-medium"
                        >
                          <CircleX size={14} aria-hidden="true" />
                          {t("compliance.reject")}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* What the check actually said, translated from its codes so
                    the desk never reads raw English out of a JSON column. */}
                {notes.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {notes.map((note, i) => (
                      <li
                        key={`${note.code}-${i}`}
                        className="px-2 h-6 inline-flex items-center rounded-pill bg-sand-100 text-sand-700 text-[11px]"
                        title={note.detail}
                      >
                        {t(`compliance.check${note.code}`)}
                      </li>
                    ))}
                  </ul>
                )}

                {doc.requestNote && (
                  <p className="mt-2 text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
                    {doc.requestNote}
                  </p>
                )}
                {doc.rejectionReason && (
                  <p className="mt-2 text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2">
                    {doc.rejectionReason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Reject ──────────────────────────────────────────────────────── */}
      <SlidePanel
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={t("compliance.reject")}
        subtitle={rejecting ? humanType(rejecting.type) : ""}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-sand-900 mb-1">
              {t("compliance.rejectReason")}
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-sand-200 bg-card p-3 text-sm"
            />
            <p className="text-xs text-sand-500 mt-1">{t("compliance.rejectHint")}</p>
          </div>
          <button
            type="button"
            disabled={!rejectReason.trim() || rejectMutation.isPending}
            onClick={() => rejecting && rejectMutation.mutate(rejecting.id)}
            className="h-10 px-5 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
          >
            {t("compliance.reject")}
          </button>
        </div>
      </SlidePanel>

      {/* ── Ask for a document ──────────────────────────────────────────── */}
      <SlidePanel
        open={asking}
        onClose={() => setAsking(false)}
        title={t("compliance.requestDocument")}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-sand-900 mb-1">
              {t("compliance.owner")}
            </label>
            <select
              value={askOwnerId}
              onChange={(e) => setAskOwnerId(e.target.value)}
              className="w-full h-10 px-3 rounded-pill border border-sand-200 bg-card text-sm"
            >
              <option value="">n/a</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-sand-900 mb-1">
              {t("compliance.type")}
            </label>
            <select
              value={askType}
              onChange={(e) => setAskType(e.target.value)}
              className="w-full h-10 px-3 rounded-pill border border-sand-200 bg-card text-sm"
            >
              <option value="">n/a</option>
              {(typesQuery.data?.types ?? []).map((type) => (
                <option key={type} value={type}>
                  {humanType(type)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-sand-900 mb-1">
              {t("compliance.requestNote")}
            </label>
            <textarea
              value={askNote}
              onChange={(e) => setAskNote(e.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-sand-200 bg-card p-3 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={!askOwnerId || !askType || askMutation.isPending}
            onClick={() => askMutation.mutate()}
            className="h-10 px-5 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
          >
            {t("compliance.requestDocument")}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}
