"use client";
// Darb 2.0 — /finance: the Money screen.
//
// This used to be three pages, and the middle one was not really a page at
// all: an overview of three stat cards whose only other content was two link
// cards pointing at the other two. Revision #31 folded all of it into one
// screen. The stat cards stayed (they are the answer to "where do we stand"),
// the link cards went, and the report views became a single row of tabs
// instead of two stacked tab strips on two routes.
//
// Revision 4 (#3) then took cash hand-ins back out, to their own portal. That
// is not a reversal of the merge: the other three tabs are all the same
// question asked three ways, and recording cash off a driver never was. The
// Driver cash card and the old ?tab=cash link both redirect to /cash-desk.
//
// The old routes redirect in here, so every bookmark and deep link still
// lands on the right tab.
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Truck, Store, Wallet } from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import ReportsPanel, { type ReportView } from "@/components/finance/ReportsPanel";
import { walletsApi, fetchAllPages } from "@/lib/darbApi";
import type { WalletAccount, WalletEntry } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd } from "@/i18n/format";
import { cn } from "@/lib/cn";

/** One flat strip of read-only reports. Cash hand-ins live at /cash-desk. */
type Tab = ReportView;

const TABS: Tab[] = ["ledger", "vendor-statements", "reconciliation"];

function isTab(value: string | null): value is Tab {
  return TABS.includes(value as Tab);
}

function sumBalances(accounts: WalletAccount[], ownerType: WalletAccount["ownerType"]): number {
  return accounts
    .filter((a) => a.ownerType === ownerType)
    .reduce((sum, a) => sum + (Number(a.balanceKwd) || 0), 0);
}

function MoneyScreen() {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();

  const router = useRouter();
  const [tab, setTab] = useState<Tab>(() => {
    const requested = searchParams.get("tab");
    return isTab(requested) ? requested : "ledger";
  });

  // Revision 4 (#3): ?tab=cash used to open the hand-in desk here. It is its
  // own portal now, so the bookmark forwards rather than 404s.
  useEffect(() => {
    if (searchParams.get("tab") === "cash") router.replace("/cash-desk");
  }, [searchParams, router]);
  // Deep links from the stat cards and from the old /finance/reports URL can
  // pre-filter the ledger by entry type.
  const [ledgerType, setLedgerType] = useState(() => searchParams.get("type") ?? "");

  // These feed totals, so they must not stop at the server's 100-row clamp —
  // with ~1 wallet account per driver, page 1 is all drivers and no platform
  // account, which silently rendered "KD 0.000" for fees.
  const accountsQuery = useQuery({
    queryKey: ["darb", "wallet-accounts", "all"],
    queryFn: () => fetchAllPages<WalletAccount>((p) => walletsApi.accounts(p)),
  });
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const entriesQuery = useQuery({
    queryKey: ["darb", "wallet-entries", "today", todayIso],
    queryFn: () =>
      fetchAllPages<WalletEntry>((p) => walletsApi.entries(p), {
        dateFrom: todayIso,
        type: "PLATFORM_REVENUE",
      }),
    retry: false,
  });

  const vendorPayables = sumBalances(accounts, "VENDOR_PAYABLE");
  const driverCash = sumBalances(accounts, "DRIVER_CASH");

  // The query already filters to PLATFORM_REVENUE server-side, so this no
  // longer depends on the platform account appearing in the accounts page.
  const feesToday = useMemo(
    () =>
      (entriesQuery.data ?? [])
        .filter((e) => e.direction === "CREDIT")
        .reduce((sum, e) => sum + (Number(e.amountKwd) || 0), 0),
    [entriesQuery.data]
  );

  const tabLabels: Record<Tab, string> = {
    ledger: t("reports.viewLedger"),
    "vendor-statements": t("reports.viewVendorStatements"),
    reconciliation: t("reports.viewReconciliation"),
  };

  /** Jump straight to the detail behind a number, the way the cards always did. */
  function openTab(next: Tab, type = "") {
    setLedgerType(type);
    setTab(next);
  }

  if (accountsQuery.isLoading) return <PageSkeleton statCards={3} tableRows={3} tableCols={3} />;
  if (accountsQuery.error) {
    return (
      <ErrorState
        error={
          accountsQuery.error instanceof Error ? accountsQuery.error.message : t("errors.loadingData")
        }
        onRetry={() => accountsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("wallet.title")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("wallet.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title={t("wallet.vendorPayables")}
          value={formatKwd(vendorPayables, locale)}
          icon={Store}
          trend={t("wallet.viewStatements")}
          onClick={() => openTab("vendor-statements")}
        />
        <StatCard
          title={t("wallet.driverCash")}
          value={formatKwd(driverCash, locale)}
          icon={Truck}
          trend={t("wallet.viewRemittances")}
          onClick={() => router.push("/cash-desk")}
        />
        <StatCard
          title={t("wallet.feesToday")}
          value={entriesQuery.isError ? "n/a" : formatKwd(feesToday, locale)}
          icon={Wallet}
          trend={t("wallet.viewLedger")}
          onClick={() => openTab("ledger", "PLATFORM_REVENUE")}
        />
      </div>

      <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit flex-wrap">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "px-4 h-9 text-sm font-medium rounded-pill transition-colors",
              tab === key ? "bg-white text-sand-900 shadow-soft" : "text-sand-600 hover:text-sand-900"
            )}
          >
            {tabLabels[key]}
          </button>
        ))}
      </div>

      {/* Remounting on a type change is deliberate: it reseeds the panel's
          own filter state from the deep link. */}
      <ReportsPanel key={`${tab}:${ledgerType}`} view={tab} initialType={ledgerType} />
    </div>
  );
}

export default function FinancePage() {
  return (
    <Suspense fallback={<PageSkeleton statCards={3} tableRows={3} tableCols={3} />}>
      <MoneyScreen />
    </Suspense>
  );
}
