"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiGet } from "@/hooks/useApi";
import TalabatLiveOpsHeader from "@/components/platform/TalabatLiveOpsHeader";
import { useI18n } from "@/i18n/I18nProvider";
import { formatCurrency } from "@/i18n/format";
import { ChevronRight } from "lucide-react";

export default function TalabatOverviewPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [companyFilter, setCompanyFilter] = useState("");

  const params = new URLSearchParams();
  if (companyFilter) params.set("companyId", companyFilter);

  const { data, loading } = useApiGet<any>(`/api/talabat/overview?${params}`);
  const { data: companiesData } = useApiGet<any>(`/api/companies?platform=TALABAT`);

  const companies = companiesData?.data || [];
  const unbookedNextWeek: any[] = data?.unbookedNextWeek || [];
  const overdueCash = data?.overdueCash || { totalAmount: 0, driverCount: 0, drivers: [] };

  if (loading) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold">Talabat {t("platform.overviewTitle")}</h1>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-gray-100 bg-white" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Talabat {t("platform.overviewTitle")}</h1>
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">{t("companies.allCompanies")}</option>
          {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* KPIs + Zones + Attention */}
      <TalabatLiveOpsHeader />

      {/* Cash + Unbooked (compact, only if non-zero) */}
      {(overdueCash.driverCount > 0 || unbookedNextWeek.length > 0) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {overdueCash.driverCount > 0 && (
            <button
              onClick={() => router.push("/talabat/cash")}
              className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 text-left hover:bg-gray-50"
            >
              <div>
                <div className="text-[11px] uppercase tracking-wider text-gray-500">{t("talabat.overdueCash")}</div>
                <div className="mt-0.5 text-lg font-semibold text-gray-900">
                  {formatCurrency(overdueCash.totalAmount, locale)} <span className="text-sm font-normal text-gray-500">· {overdueCash.driverCount} drivers</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-400" />
            </button>
          )}
          {unbookedNextWeek.length > 0 && (
            <button
              onClick={() => router.push("/talabat/shifts")}
              className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 text-left hover:bg-gray-50"
            >
              <div>
                <div className="text-[11px] uppercase tracking-wider text-gray-500">{t("talabat.noShiftBooked")}</div>
                <div className="mt-0.5 text-lg font-semibold text-gray-900">
                  {unbookedNextWeek.length} <span className="text-sm font-normal text-gray-500">· {t("talabat.next7Days")}</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-400" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
