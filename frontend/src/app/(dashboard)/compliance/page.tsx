"use client";
// Revision 20 — /compliance: the Compliance tab.
//
// Three subtabs, all new, so all three are query params on this one route.
//
// The gate is the COMPLIANCE surface rather than a role. The client described a
// compliance TEAM, and a team on this platform is a set of people who were
// granted a screen — a dedicated officer is typically a VIEWER with this one
// surface on EDIT. Gating on rank would have meant the only way to give
// somebody the compliance desk was to make them an ops manager.
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import HqTabs from "@/components/hq/HqTabs";
import ComplianceDocumentsTab from "@/components/hq/ComplianceDocumentsTab";
import RenewalScheduleTab from "@/components/hq/RenewalScheduleTab";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { COMPLIANCE_TABS } from "@/lib/hqTabs";
import { useQuery } from "@tanstack/react-query";
import { complianceApi } from "@/lib/darbApi";
import { useI18n } from "@/i18n/I18nProvider";
import { usePermissions } from "@/hooks/usePermissions";

function ComplianceScreen() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const { can, isLoading } = usePermissions();

  // The counts behind the tab badges. Enabled only once access is known, so a
  // refused user never fires a call the server would 403.
  const countsQuery = useQuery({
    queryKey: ["darb", "compliance", "counts"],
    queryFn: () => complianceApi.counts(),
    enabled: !isLoading && can("COMPLIANCE"),
    refetchInterval: 60_000,
  });
  const counts = countsQuery.data;

  if (isLoading) return <PageSkeleton statCards={3} tableRows={6} tableCols={6} />;

  // The in-page mirror of the server's gate, so somebody who arrives by URL
  // reads a sentence rather than watching three panels 403 one by one.
  if (!can("COMPLIANCE")) {
    return (
      <div className="bg-card border border-sand-200 rounded-2xl shadow-soft p-8 text-center">
        <p className="text-sm text-sand-600">{t("compliance.permissionDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("compliance.title")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("compliance.subtitle")}</p>
      </div>

      <HqTabs
        tabs={COMPLIANCE_TABS}
        counts={{
          "driver-documents": counts?.driverPending,
          "partner-documents": (counts?.companyPending ?? 0) + (counts?.vendorPending ?? 0),
          renewals: counts?.expired,
        }}
      />

      {tab === "renewals" ? (
        <RenewalScheduleTab />
      ) : tab === "partner-documents" ? (
        <ComplianceDocumentsTab scope="PARTNER" />
      ) : (
        <ComplianceDocumentsTab scope="DRIVER" />
      )}
    </div>
  );
}

export default function CompliancePage() {
  return (
    <Suspense fallback={<PageSkeleton statCards={3} tableRows={6} tableCols={6} />}>
      <ComplianceScreen />
    </Suspense>
  );
}
