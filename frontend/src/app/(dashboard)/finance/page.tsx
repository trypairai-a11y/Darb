"use client";
// Darb 2.0 — /finance: wallet overview. StatCards aggregated from
// /api/wallets/accounts (vendor payables, driver cash-on-hand, fees today)
// plus link cards into remittances / adjustments / reports.
import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { HandCoins, FileText, Wallet, Truck, Store } from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { walletsApi, fetchAllPages } from "@/lib/darbApi";
import type { WalletAccount, WalletEntry } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd } from "@/i18n/format";
import { DirectionalIcon } from "@/i18n/directionalIcon";

function sumBalances(accounts: WalletAccount[], ownerType: WalletAccount["ownerType"]): number {
  return accounts
    .filter((a) => a.ownerType === ownerType)
    .reduce((sum, a) => sum + (Number(a.balanceKwd) || 0), 0);
}

export default function FinanceOverviewPage() {
  const { t, locale } = useI18n();
  const router = useRouter();

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

  const links = [
    {
      href: "/finance/remittances",
      icon: HandCoins,
      title: t("darbNav.remittances"),
      desc: t("wallet.openRemittances"),
    },
    {
      href: "/finance/reports",
      icon: FileText,
      title: t("darbNav.reports"),
      desc: t("wallet.openReports"),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("wallet.title")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("wallet.subtitle")}</p>
      </div>

      {/* Each card drills into the detail behind its number — they used to be
          inert, which read as "the three buttons on top do not work". */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title={t("wallet.vendorPayables")}
          value={formatKwd(vendorPayables, locale)}
          icon={Store}
          trend={t("wallet.viewStatements")}
          onClick={() => router.push("/finance/reports?view=vendor-statements")}
        />
        <StatCard
          title={t("wallet.driverCash")}
          value={formatKwd(driverCash, locale)}
          icon={Truck}
          trend={t("wallet.viewRemittances")}
          onClick={() => router.push("/finance/remittances")}
        />
        <StatCard
          title={t("wallet.feesToday")}
          value={entriesQuery.isError ? "n/a" : formatKwd(feesToday, locale)}
          icon={Wallet}
          trend={t("wallet.viewLedger")}
          onClick={() => router.push("/finance/reports?view=ledger&type=PLATFORM_REVENUE")}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group bg-card border border-sand-200 rounded-2xl p-5 shadow-soft transition-all duration-400 ease-sierra-out hover:shadow-lift hover:-translate-y-[1px]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="h-9 w-9 rounded-pill bg-sand-100 flex items-center justify-center text-sand-700 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                <link.icon size={16} aria-hidden="true" />
              </div>
              <DirectionalIcon
                kind="arrow-forward"
                size={15}
                className="text-sand-400 group-hover:text-primary transition-colors"
                aria-hidden="true"
              />
            </div>
            <p className="font-medium text-sand-900 mt-3">{link.title}</p>
            <p className="text-xs text-sand-600 mt-1">{link.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
