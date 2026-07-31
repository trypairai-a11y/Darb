"use client";
// Darb 2.0 revision 12 — /fleet-portal/issues.
//
// Darb's system opens these; the delivery company closes them. That is the
// opposite direction of travel from Support, which is why it is its own tab: a
// supervisor works an inbox of things Darb noticed, calls the driver, and
// records what they did.
//
// Resolving requires a note. An acknowledge button with no account of the fix
// is a button that gets clicked to clear a badge, and the whole point of this
// tab is that somebody actually picked up the phone.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Phone, TriangleAlert } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import SlidePanel from "@/components/shared/SlidePanel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import { fleetApi } from "@/lib/darbApi";
import type { FleetIssue } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime } from "@/i18n/format";
import { cn } from "@/lib/cn";

const SEVERITY_RING: Record<string, string> = {
  HIGH: "border-red-200 bg-red-50",
  MEDIUM: "border-amber-200 bg-amber-50",
  LOW: "border-sand-200 bg-white",
};

export default function FleetIssuesPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [showResolved, setShowResolved] = useState(false);
  const [resolving, setResolving] = useState<FleetIssue | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const issuesQuery = useQuery({
    queryKey: ["darb", "fleet", "issues", showResolved],
    queryFn: () => fleetApi.issues({ includeResolved: showResolved }),
    refetchInterval: 120_000,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["darb", "fleet", "issues"] });

  const fail = (err: unknown) =>
    toast.error(
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("toast.failedSave"),
    );

  async function acknowledge(id: string) {
    try {
      await fleetApi.acknowledgeIssue(id);
      await refresh();
    } catch (err) {
      fail(err);
    }
  }

  async function resolve() {
    if (!resolving) return;
    setSaving(true);
    try {
      await fleetApi.resolveIssue(resolving.id, note.trim());
      toast.success(t("fleetPortal.issueResolved"));
      setResolving(null);
      setNote("");
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  if (issuesQuery.isLoading) return <PageSkeleton statCards={0} tableRows={6} tableCols={1} />;
  if (issuesQuery.error) {
    return (
      <ErrorState
        error={
          issuesQuery.error instanceof Error
            ? issuesQuery.error.message
            : t("errors.loadingData")
        }
        onRetry={() => issuesQuery.refetch()}
      />
    );
  }

  const issues = issuesQuery.data?.issues ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-display-sm text-sand-900">
            {t("fleetPortal.issuesTitle")}
          </h1>
          <p className="text-sm text-sand-600 mt-1">{t("fleetPortal.issuesSubtitle")}</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-sand-700">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="rounded border-sand-300"
          />
          {t("fleetPortal.showResolved")}
        </label>
      </div>

      {issues.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-6 rounded-xl border border-sand-200 bg-white">
          <CheckCircle2 size={18} className="text-forest-600" aria-hidden="true" />
          <p className="text-sm text-sand-600">{t("fleetPortal.noIssues")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {issues.map((issue) => (
            <li
              key={issue.id}
              className={cn(
                "rounded-xl border px-4 py-3.5",
                issue.status === "RESOLVED"
                  ? "border-sand-200 bg-sand-50"
                  : SEVERITY_RING[issue.severity] ?? SEVERITY_RING.LOW,
              )}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <TriangleAlert
                      size={15}
                      className={
                        issue.severity === "HIGH" ? "text-red-600" : "text-amber-600"
                      }
                      aria-hidden="true"
                    />
                    <p className="text-sm font-medium text-sand-900" dir="auto">
                      {issue.title}
                    </p>
                    <StatusBadge
                      status={issue.status}
                      label={
                        issue.status === "ESCALATED"
                          ? t("fleetPortal.escalated")
                          : issue.status === "ACKNOWLEDGED"
                            ? t("fleetPortal.acknowledged")
                            : undefined
                      }
                    />
                  </div>
                  <p className="text-sm text-sand-600 mt-1" dir="auto">
                    {issue.detail}
                  </p>
                  <p className="text-xs text-sand-500 mt-1.5">
                    {t("fleetPortal.raisedOn")} {formatDateTime(issue.openedAt, locale)}
                  </p>
                  {issue.resolutionNote && (
                    <p className="text-xs text-forest-700 mt-1.5" dir="auto">
                      {t("fleetPortal.resolutionNote")}: {issue.resolutionNote}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* The driver's number, right here. The next action on almost
                      every one of these is a phone call. */}
                  {issue.driver?.phone && (
                    <a
                      href={`tel:${issue.driver.phone}`}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-sand-300 bg-white text-xs text-sand-700 hover:bg-sand-100"
                    >
                      <Phone size={13} aria-hidden="true" />
                      <span dir="ltr" className="tabular-nums">{issue.driver.phone}</span>
                    </a>
                  )}
                  {(issue.status === "OPEN" || issue.status === "ESCALATED") && (
                    <button
                      type="button"
                      onClick={() => acknowledge(issue.id)}
                      className="h-9 px-3 rounded-full border border-sand-300 bg-white text-xs font-medium text-sand-700 hover:bg-sand-100"
                    >
                      {t("fleetPortal.acknowledge")}
                    </button>
                  )}
                  {issue.status !== "RESOLVED" && (
                    <button
                      type="button"
                      onClick={() => { setResolving(issue); setNote(""); }}
                      className="h-9 px-3 rounded-full bg-primary text-white text-xs font-medium hover:opacity-90"
                    >
                      {t("fleetPortal.resolveIssue")}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SlidePanel
        open={!!resolving}
        onClose={() => setResolving(null)}
        title={t("fleetPortal.resolveTitle")}
        subtitle={resolving?.title}
      >
        <div className="space-y-4">
          <p className="text-sm text-sand-600">{t("fleetPortal.resolveHint")}</p>
          <label className="block">
            <span className="text-xs font-medium text-sand-700">
              {t("fleetPortal.resolutionNote")}
            </span>
            <textarea
              rows={5}
              dir="auto"
              className="w-full px-3 py-2 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={saving || note.trim().length < 5}
            onClick={resolve}
            className="w-full h-10 rounded-full bg-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {t("fleetPortal.resolveIssue")}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}
