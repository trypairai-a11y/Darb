"use client";
// Revision 20 — Ops › New accounts.
//
// "this tab is for the sales team to add the requests to create new vendor
// accounts or delivery companies accounts".
//
// Two audiences on one screen and they are not the same person. A sales rep
// raises a lead and can do that from any staff login, because a feature that
// makes them ask somebody else to type it in is a feature they will not use.
// An ops manager decides, and approval is what actually creates the account —
// so the Approve button says "Approve and create" rather than "Approve", and
// the hint underneath says what happens.
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Store, Truck } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import { useToast } from "@/components/shared/Toast";
import { onboardingApi } from "@/lib/darbApi";
import type { OnboardingRequest, OnboardingStatus, OnboardingType } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime } from "@/i18n/format";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/cn";

const STATUS_I18N: Record<OnboardingStatus, string> = {
  NEW: "hqOnboarding.statusNew",
  IN_REVIEW: "hqOnboarding.statusInReview",
  APPROVED: "hqOnboarding.statusApproved",
  REJECTED: "hqOnboarding.statusRejected",
};

const STATUS_TONE: Record<OnboardingStatus, string> = {
  NEW: "bg-primary/10 text-primary",
  IN_REVIEW: "bg-amber-100 text-amber-700",
  APPROVED: "bg-forest-100 text-forest-700",
  REJECTED: "bg-red-100 text-red-700",
};

const EMPTY_DRAFT = {
  type: "VENDOR" as OnboardingType,
  companyName: "",
  companyNameAr: "",
  code: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  notes: "",
};

export default function OnboardingTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { hasRole } = useRole();
  const canDecide = hasRole("OPS_MANAGER");

  const [filter, setFilter] = useState<"waiting" | OnboardingStatus | "">("waiting");
  const [typeFilter, setTypeFilter] = useState<OnboardingType | "">("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [deciding, setDeciding] = useState<OnboardingRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approveCode, setApproveCode] = useState("");

  const listQuery = useQuery({
    queryKey: ["darb", "onboarding", filter, typeFilter],
    queryFn: () =>
      onboardingApi.list({
        // "waiting" is NEW and IN_REVIEW, which the server has no single word
        // for, so the filter is applied here rather than inventing a status.
        ...(filter && filter !== "waiting" ? { status: filter } : {}),
        ...(typeFilter ? { type: typeFilter } : {}),
      }),
  });

  const all = listQuery.data?.data ?? [];
  const rows =
    filter === "waiting" ? all.filter((r) => r.status === "NEW" || r.status === "IN_REVIEW") : all;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["darb", "onboarding"] });
  }
  function failWith(err: unknown) {
    const payload = (err as { response?: { data?: { error?: string } } })?.response?.data;
    toast.error(payload?.error ?? t("errors.savingData"));
  }

  const createMutation = useMutation({
    mutationFn: () =>
      onboardingApi.create({
        type: draft.type,
        companyName: draft.companyName.trim(),
        ...(draft.companyNameAr.trim() ? { companyNameAr: draft.companyNameAr.trim() } : {}),
        ...(draft.code.trim() ? { code: draft.code.trim().toUpperCase() } : {}),
        ...(draft.contactName.trim() ? { contactName: draft.contactName.trim() } : {}),
        ...(draft.contactPhone.trim() ? { contactPhone: draft.contactPhone.trim() } : {}),
        ...(draft.contactEmail.trim() ? { contactEmail: draft.contactEmail.trim() } : {}),
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success(t("hqOnboarding.created"));
      setAdding(false);
      setDraft(EMPTY_DRAFT);
      refresh();
    },
    onError: failWith,
  });

  const approveMutation = useMutation({
    mutationFn: (row: OnboardingRequest) =>
      onboardingApi.approve(row.id, approveCode.trim() ? { code: approveCode.trim().toUpperCase() } : {}),
    onSuccess: () => {
      toast.success(t("hqOnboarding.approvedToast"));
      setDeciding(null);
      setApproveCode("");
      refresh();
    },
    onError: failWith,
  });

  const rejectMutation = useMutation({
    mutationFn: (row: OnboardingRequest) => onboardingApi.reject(row.id, rejectReason.trim()),
    onSuccess: () => {
      toast.success(t("hqOnboarding.rejectedToast"));
      setDeciding(null);
      setRejectReason("");
      refresh();
    },
    onError: failWith,
  });

  if (listQuery.isLoading) return <PageSkeleton statCards={0} tableRows={6} tableCols={5} />;
  if (listQuery.error) {
    return (
      <ErrorState
        error={listQuery.error instanceof Error ? listQuery.error.message : t("errors.loadingData")}
        onRetry={() => listQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-sand-900">{t("hqOnboarding.title")}</h2>
          <p className="text-sm text-sand-600 mt-1">{t("hqOnboarding.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="h-10 px-5 inline-flex items-center gap-2 rounded-pill bg-primary text-white text-sm font-medium"
        >
          <Plus size={15} aria-hidden="true" />
          {t("hqOnboarding.add")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-sand-100 rounded-pill p-1">
          {(["waiting", "APPROVED", "REJECTED"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "px-4 h-8 text-sm font-medium rounded-pill transition-colors",
                filter === key ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900",
              )}
            >
              {key === "waiting" ? t("financeDesk.showPending") : t(STATUS_I18N[key])}
            </button>
          ))}
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as OnboardingType | "")}
          className="h-9 px-3 rounded-pill border border-sand-200 bg-card text-sm"
        >
          <option value="">{t("hqOnboarding.allTypes")}</option>
          <option value="VENDOR">{t("hqOnboarding.typeVendor")}</option>
          <option value="FLEET">{t("hqOnboarding.typeFleet")}</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-10 text-center">
          <p className="text-sm text-sand-500">{t("hqOnboarding.empty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rows.map((row) => (
            <div key={row.id} className="bg-card border border-sand-200 rounded-2xl shadow-soft p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {row.type === "VENDOR" ? (
                      <Store size={15} className="text-sand-500 shrink-0" aria-hidden="true" />
                    ) : (
                      <Truck size={15} className="text-sand-500 shrink-0" aria-hidden="true" />
                    )}
                    <p className="font-medium text-sand-900 truncate">{row.companyName}</p>
                    {row.code && (
                      <span className="text-xs text-sand-500 font-mono shrink-0">{row.code}</span>
                    )}
                  </div>
                  <p className="text-xs text-sand-500 mt-1">
                    {[row.contactName, row.contactPhone, row.contactEmail].filter(Boolean).join(" · ") ||
                      "n/a"}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 px-2 h-6 inline-flex items-center rounded-pill text-[11px] font-medium",
                    STATUS_TONE[row.status],
                  )}
                >
                  {t(STATUS_I18N[row.status])}
                </span>
              </div>

              {row.notes && <p className="text-sm text-sand-600 mt-2">{row.notes}</p>}
              {row.reviewNote && row.status === "REJECTED" && (
                <p className="text-sm text-red-700 mt-2 bg-red-50 rounded-xl px-3 py-2">{row.reviewNote}</p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-sand-100">
                <p className="text-xs text-sand-500">
                  {row.createdBy
                    ? t("hqOnboarding.raisedBy").replace("{name}", row.createdBy.name)
                    : "n/a"}
                  {" · "}
                  {formatDateTime(row.createdAt, locale)}
                </p>
                <div className="flex items-center gap-2">
                  {row.status === "APPROVED" && (row.vendorId || row.fleetPartnerId) && (
                    <Link
                      href={row.vendorId ? `/vendors/${row.vendorId}` : `/fleets/${row.fleetPartnerId}`}
                      className="h-8 px-3 inline-flex items-center rounded-pill border border-sand-200 text-sand-700 text-xs"
                    >
                      {t("hqOnboarding.openAccount")}
                    </Link>
                  )}
                  {canDecide && (row.status === "NEW" || row.status === "IN_REVIEW") && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeciding(row);
                        setApproveCode(row.code ?? "");
                        setRejectReason("");
                      }}
                      className="h-8 px-4 rounded-pill bg-primary text-white text-xs font-medium"
                    >
                      {t("hqOnboarding.approve")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add a lead ──────────────────────────────────────────────────── */}
      <SlidePanel open={adding} onClose={() => setAdding(false)} title={t("hqOnboarding.add")}>
        <div className="space-y-4">
          <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit">
            {(["VENDOR", "FLEET"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, type }))}
                className={cn(
                  "px-4 h-8 text-sm font-medium rounded-pill transition-colors",
                  draft.type === type
                    ? "bg-white text-sand-900 shadow-soft"
                    : "text-sand-600 hover:text-sand-900",
                )}
              >
                {t(type === "VENDOR" ? "hqOnboarding.typeVendor" : "hqOnboarding.typeFleet")}
              </button>
            ))}
          </div>

          {(
            [
              ["companyName", "hqOnboarding.companyName"],
              ["companyNameAr", "hqOnboarding.companyNameAr"],
              ["contactName", "hqOnboarding.contactName"],
              ["contactPhone", "hqOnboarding.contactPhone"],
              ["contactEmail", "hqOnboarding.contactEmail"],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <label className="block text-sm font-medium text-sand-900 mb-1">{t(label)}</label>
              <input
                value={draft[field]}
                onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
                className="w-full h-10 px-3 rounded-pill border border-sand-200 bg-card text-sm"
              />
            </div>
          ))}

          {/* Only a shop carries a code: it is what order numbers are built from. */}
          {draft.type === "VENDOR" && (
            <div>
              <label className="block text-sm font-medium text-sand-900 mb-1">
                {t("hqOnboarding.code")}
              </label>
              <input
                value={draft.code}
                onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))}
                maxLength={8}
                className="w-full h-10 px-3 rounded-pill border border-sand-200 bg-card text-sm font-mono"
              />
              <p className="text-xs text-sand-500 mt-1">{t("hqOnboarding.codeHint")}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-sand-900 mb-1">
              {t("hqOnboarding.notes")}
            </label>
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-2xl border border-sand-200 bg-card p-3 text-sm"
            />
          </div>

          <button
            type="button"
            disabled={!draft.companyName.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="h-10 px-5 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
          >
            {t("hqOnboarding.add")}
          </button>
        </div>
      </SlidePanel>

      {/* ── Decide ──────────────────────────────────────────────────────── */}
      <SlidePanel
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={deciding?.companyName ?? ""}
        subtitle={t(deciding?.type === "FLEET" ? "hqOnboarding.typeFleet" : "hqOnboarding.typeVendor")}
      >
        <div className="space-y-5">
          {deciding?.type === "VENDOR" && (
            <div>
              <label className="block text-sm font-medium text-sand-900 mb-1">
                {t("hqOnboarding.code")}
              </label>
              <input
                value={approveCode}
                onChange={(e) => setApproveCode(e.target.value.toUpperCase())}
                maxLength={8}
                className="w-full h-10 px-3 rounded-pill border border-sand-200 bg-card text-sm font-mono"
              />
              <p className="text-xs text-sand-500 mt-1">{t("hqOnboarding.codeHint")}</p>
            </div>
          )}

          <div>
            <button
              type="button"
              disabled={approveMutation.isPending}
              onClick={() => deciding && approveMutation.mutate(deciding)}
              className="h-10 px-5 rounded-pill bg-primary text-white text-sm font-medium disabled:opacity-40"
            >
              {t("hqOnboarding.approve")}
            </button>
            <p className="text-xs text-sand-500 mt-1">{t("hqOnboarding.approveHint")}</p>
          </div>

          <div className="border-t border-sand-100 pt-4">
            <label className="block text-sm font-medium text-sand-900 mb-1">
              {t("hqOnboarding.rejectReason")}
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-sand-200 bg-card p-3 text-sm"
            />
            <button
              type="button"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => deciding && rejectMutation.mutate(deciding)}
              className="mt-2 h-10 px-5 rounded-pill border border-sand-200 text-sand-700 text-sm font-medium disabled:opacity-40"
            >
              {t("hqOnboarding.reject")}
            </button>
          </div>
        </div>
      </SlidePanel>
    </div>
  );
}
