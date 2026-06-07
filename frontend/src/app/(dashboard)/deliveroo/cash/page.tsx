"use client";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useApiGet } from "@/hooks/useApi";
import StatCard from "@/components/shared/StatCard";
import { cn } from "@/lib/cn";
import api from "@/lib/api";
import InsightBanner from "@/components/shared/InsightBanner";
import TalabatCodLedger from "@/components/platform/TalabatCodLedger";
import {
  Wallet, AlertTriangle, TrendingUp, Download, Upload,
  ChevronDown, ChevronRight, ChevronLeft, X, Check, Loader2,
  Calendar, Bell,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { formatCurrency, formatTime } from "@/i18n/format";

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));

type LedgerRow = {
  id: string;
  riderId: string;
  riderName: string;
  companyCode: string;
  status: string;
  openingBalance: number;
  totalSales: number;
  totalCollection: number;
  cashAlMuzaini: number;
  bankTransfer: number;
  incentivesTips: number;
  adjustments: number;
  pendingDues: number;
  dailySales: Record<string, number>;
  dailyCollections: Record<string, number>;
};

function kd(v: any) {
  if (v == null) return "-";
  return Number(v).toFixed(3);
}

function parseRiderName(fullName: string): { name: string; batch: string; company: string } {
  // Pattern: "PANKAJ DUBEY 1 - WAHI" or "FIROZ SHAH 2A - WAHI"
  const match = fullName.match(/^(.+?)\s+(\d+[A-Za-z]?)\s*[-–-]\s*(.+)$/);
  if (match) {
    return { name: match[1].trim(), batch: match[2].trim(), company: match[3].trim() };
  }
  // Fallback: try splitting on " - " for company only
  const dashIdx = fullName.lastIndexOf(" - ");
  if (dashIdx !== -1) {
    return { name: fullName.slice(0, dashIdx).trim(), batch: "-", company: fullName.slice(dashIdx + 3).trim() };
  }
  return { name: fullName, batch: "-", company: "-" };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function DatePicker({
  month: monthValue,
  onMonthChange,
  selectedDays,
  onDaysChange,
}: {
  month: string;
  onMonthChange: (v: string) => void;
  selectedDays: string[];
  onDaysChange: (days: string[]) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"months" | "days">("months");
  const ref = useRef<HTMLDivElement>(null);
  const [year, month] = monthValue.split("-").map(Number);
  const [viewYear, setViewYear] = useState(year);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => { setViewYear(year); }, [year]);

  const [rangeStart, setRangeStart] = useState<string | null>(null);

  function clickMonth(m: number) {
    onMonthChange(`${viewYear}-${String(m).padStart(2, "0")}`);
    onDaysChange([]);
    setRangeStart(null);
    setView("days");
  }

  function toggleDay(day: string) {
    if (rangeStart === null) {
      // First click - set start of range
      setRangeStart(day);
      onDaysChange([day]);
    } else if (rangeStart === day) {
      // Clicked same day - deselect
      setRangeStart(null);
      onDaysChange([]);
    } else {
      // Second click - build contiguous range
      const start = Math.min(Number(rangeStart), Number(day));
      const end = Math.max(Number(rangeStart), Number(day));
      const range: string[] = [];
      for (let i = start; i <= end; i++) {
        range.push(String(i).padStart(2, "0"));
      }
      onDaysChange(range);
      setRangeStart(null);
    }
  }

  function selectAllDays() {
    onDaysChange([]);
    setRangeStart(null);
    setOpen(false);
    setView("months");
  }

  const daysInMonth = getDaysInMonth(year, month);

  const displayLabel = selectedDays.length > 0
    ? selectedDays.length === 1
      ? `${selectedDays[0]} ${MONTHS[month - 1]} ${year}`
      : `${selectedDays.length} ${t("talabat.daysInMonth")} ${MONTHS[month - 1]} ${year}`
    : `${MONTHS[month - 1]} ${year}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(!open); setView("months"); }}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-200"
      >
        <Calendar size={15} className="text-secondary" />
        <span className="font-medium">{displayLabel}</span>
        <ChevronDown size={14} className={cn("text-secondary transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl shadow-lg border border-gray-100 p-3 z-50 min-w-[260px]">
          {view === "months" ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setViewYear(viewYear - 1)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronLeft size={16} className="text-secondary" />
                </button>
                <span className="text-sm font-semibold">{viewYear}</span>
                <button onClick={() => setViewYear(viewYear + 1)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronRight size={16} className="text-secondary" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {MONTHS.map((m, i) => {
                  const isSelected = viewYear === year && i + 1 === month && selectedDays.length === 0;
                  const isCurrentMonth = viewYear === new Date().getFullYear() && i + 1 === new Date().getMonth() + 1;
                  return (
                    <button
                      key={m}
                      onClick={() => clickMonth(i + 1)}
                      className={cn(
                        "px-2 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        isSelected
                          ? "bg-orange-500 text-white"
                          : isCurrentMonth
                            ? "bg-orange-50 text-orange-600 hover:bg-orange-100"
                            : "text-gray-600 hover:bg-gray-100"
                      )}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-secondary mt-2.5 text-center">{t("talabat.selectMonthHint")}</p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setView("months")} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronLeft size={16} className="text-secondary" />
                </button>
                <span className="text-sm font-semibold">{MONTHS[month - 1]} {year}</span>
                <button onClick={selectAllDays} className="text-xs text-orange-600 hover:text-orange-700 font-medium px-2 py-1 hover:bg-orange-50 rounded-lg transition-colors whitespace-nowrap">
                  {t("talabat.entireMonth")}
                </button>
              </div>
              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Su","Mo","Tu","We","Th","Fr","Sa"].map((wd) => (
                  <span key={wd} className="w-8 h-6 flex items-center justify-center text-[10px] font-medium text-secondary">
                    {wd}
                  </span>
                ))}
              </div>
              {/* Calendar days */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells for offset */}
                {Array.from({ length: new Date(year, month - 1, 1).getDay() }, (_, i) => (
                  <span key={`empty-${i}`} className="w-8 h-8" />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = String(i + 1).padStart(2, "0");
                  const isSelected = selectedDays.includes(day);
                  const isRangeStart = rangeStart === day && selectedDays.length === 1;
                  const isToday =
                    year === new Date().getFullYear() &&
                    month === new Date().getMonth() + 1 &&
                    i + 1 === new Date().getDate();
                  return (
                    <button
                      key={day}
                      onClick={() => toggleDay(day)}
                      className={cn(
                        "w-8 h-8 rounded-lg text-xs font-medium transition-colors flex items-center justify-center",
                        isSelected
                          ? "bg-orange-500 text-white"
                          : isToday
                            ? "bg-orange-50 text-orange-600 hover:bg-orange-100"
                            : "text-gray-600 hover:bg-gray-100",
                        isRangeStart && "ring-2 ring-orange-300 ring-offset-1"
                      )}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                <span className="text-[10px] text-secondary">
                  {rangeStart && selectedDays.length === 1
                    ? t("talabat.clickAnotherDayRange")
                    : selectedDays.length === 0
                      ? t("talabat.entireMonth")
                      : `${selectedDays.length} ${selectedDays.length === 1 ? t("talabat.daySelected") : t("talabat.daysSelected")}`}
                </span>
                <button
                  onClick={() => { setOpen(false); setView("months"); }}
                  className="text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 px-3 py-1 rounded-lg transition-colors"
                >
                  {t("talabat.done")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DepositModal({ rider, onClose, onSuccess }: { rider: LedgerRow; onClose: () => void; onSuccess: () => void }) {
  const { t, locale } = useI18n();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || isNaN(Number(amount))) { setError(t("talabat.enterValidAmount")); return; }
    setLoading(true);
    try {
      await api.post("/api/cash/deposit", {
        riderId: rider.riderId,
        amount: Number(amount),
        method,
        note,
        platform: "TALABAT",
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || t("talabat.failedDeposit"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{t("talabat.recordDeposit")}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-50 rounded-lg" aria-label={t("common.close")}><X size={18} /></button>
        </div>
        <p className="text-sm text-secondary mb-5">
          {t("table.driver")}: <span className="font-medium text-foreground">{rider.riderName}</span>
          {" · "}{t("talabat.pending")}: <span className="font-medium text-orange-600">{formatCurrency(rider.pendingDues, locale)}</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">{t("talabat.amountKd")}</label>
            <input
              type="number"
              step="0.001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.000"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">{t("talabat.method")}</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
            >
              <option value="CASH">{t("talabat.methodCash")}</option>
              <option value="AL_MUZAINI">{t("talabat.methodAlMuzaini")}</option>
              <option value="BANK_TRANSFER">{t("talabat.methodBankTransfer")}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">{t("talabat.noteOptional")}</label>
            <input
              type="text"
              dir="auto"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("talabat.notePlaceholder")}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 text-white text-sm font-medium rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {t("talabat.confirmDeposit")}
          </button>
        </form>
      </div>
    </div>
  );
}

const REFRESH_INTERVAL = 30_000; // 30 seconds

export default function TalabatCashPage() {
  const { t, locale } = useI18n();
  const [month, setMonth] = useState(new Date().toLocaleDateString("en-CA").slice(0, 7));
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [depositRider, setDepositRider] = useState<LedgerRow | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const { data: settingsData } = useApiGet<any>(`/api/platform-settings/TALABAT`);
  const cashThreshold = settingsData?.shiftRules?.maxCashHoldKD ?? 100;

  const { data, refetch: rawRefetch } = useApiGet<any>(`/api/cash/ledger?month=${month}&limit=100`);

  const refetch = useCallback(async () => {
    setRefreshing(true);
    await rawRefetch();
    setLastUpdated(new Date());
    setRefreshing(false);
  }, [rawRefetch]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(refetch, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [refetch]);
  // Map Prisma fields to LedgerRow shape
  const ledger: LedgerRow[] = (data?.data || []).map((r: any) => ({
    id: r.id,
    riderId: r.driver?.platformDriverId || r.driverId,
    riderName: r.driver?.name || "-",
    companyCode: "WAHI",
    status: r.driver?.status || "ACTIVE",
    openingBalance: Number(r.openingBalance || 0),
    totalSales: Number(r.totalSales || 0),
    totalCollection: Number(r.totalCollection || 0),
    cashAlMuzaini: Number(r.cashDeposits || 0),
    bankTransfer: Number(r.bankTransfers || 0),
    incentivesTips: Number(r.incentives || 0),
    adjustments: Number(r.adjustments || 0),
    pendingDues: Number(r.closingBalance || 0),
    dailySales: r.dailySales || {},
    dailyCollections: r.dailyCollections || {},
  }));

  // Extract unique companies from rider names
  const companies = useMemo(() => {
    const set = new Set<string>();
    ledger.forEach((r) => {
      const c = parseRiderName(r.riderName).company;
      if (c && c !== "-") set.add(c);
    });
    return Array.from(set).sort();
  }, [ledger]);

  const filtered = useMemo(() => {
    let rows = ledger;
    if (companyFilter) {
      rows = rows.filter((r) => parseRiderName(r.riderName).company === companyFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.riderName?.toLowerCase().includes(q) ||
          r.riderId?.toLowerCase().includes(q) ||
          r.companyCode?.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [ledger, search, companyFilter]);

  // When specific days are selected, compute day-filtered totals
  const hasDayFilter = selectedDays.length > 0;

  function sumForDays(row: LedgerRow, field: "dailySales" | "dailyCollections") {
    if (!hasDayFilter) return field === "dailySales" ? row.totalSales : row.totalCollection;
    return selectedDays.reduce((sum, d) => sum + (Number(row[field]?.[d]) || 0), 0);
  }

  // Month-1 alert: flag any driver with non-zero remaining balance on the 1st of the month
  const today = new Date();
  const isMonthStart = today.getDate() === 1;
  const isCurrentMonth = month === today.toLocaleDateString("en-CA").slice(0, 7);
  const overdueDrivers = (isMonthStart && isCurrentMonth)
    ? filtered.filter((r) => r.pendingDues > 0)
    : [];

  // Summary calculations
  const totalCollected = hasDayFilter
    ? ledger.reduce((s, r) => s + sumForDays(r, "dailyCollections"), 0)
    : ledger.reduce((s, r) => s + r.totalCollection, 0);
  const totalDeposits = hasDayFilter ? 0 : ledger.reduce((s, r) => s + r.cashAlMuzaini + r.bankTransfer, 0);
  const totalPending = hasDayFilter
    ? ledger.reduce((s, r) => s + sumForDays(r, "dailySales") - sumForDays(r, "dailyCollections"), 0)
    : ledger.reduce((s, r) => s + r.pendingDues, 0);

  async function handleExport() {
    try {
      const res = await api.get(`/api/cash/ledger/export?platform=TALABAT&month=${month}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `talabat-cash-ledger-${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleImport(file: File) {
    setImportLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("platform", "TALABAT");
      form.append("month", month);
      await api.post("/api/cash/ledger/import", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      refetch();
    } catch (e) {
      console.error(e);
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div className="space-y-6 w-full max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-talabat" />
          <h1 className="text-xl font-semibold">{t("talabat.cashTitle")}</h1>
          <span className="text-sm text-secondary">{t("talabat.wahooIntl")}</span>
          <div className="flex items-center gap-1.5 ms-1">
            <span className={cn("w-2 h-2 rounded-full", refreshing ? "bg-orange-400 animate-pulse" : "bg-green-400 animate-pulse")} />
            <span className="text-xs text-secondary">
              {refreshing ? t("talabat.updating") : `${t("talabat.updatedAt")} ${formatTime(lastUpdated, locale)}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker month={month} onMonthChange={setMonth} selectedDays={selectedDays} onDaysChange={setSelectedDays} />
          <label className={cn(
            "flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors cursor-pointer",
            importLoading && "opacity-50 pointer-events-none"
          )}>
            {importLoading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} className="text-secondary" />}
            {t("talabat.importXlsx")}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }}
            />
          </label>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Download size={15} className="text-secondary" /> {t("talabat.exportXlsx")}
          </button>
        </div>
      </div>

      {/* AI Insights */}
      <InsightBanner context="talabat/cash" platform="TALABAT" maxInsights={2} />

      {/* R8 · COD per driver ledger */}
      <TalabatCodLedger />

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          title={t("talabat.totalCollected")}
          value={formatCurrency(totalCollected, locale)}
          icon={TrendingUp}
        />
        <StatCard
          title={t("talabat.totalDeposits")}
          value={formatCurrency(totalDeposits, locale)}
          icon={Wallet}
        />
        <StatCard
          title={t("talabat.totalRemainingBalance")}
          value={formatCurrency(totalPending, locale)}
          icon={AlertTriangle}
          highlight={totalPending > cashThreshold}
          className={totalPending > cashThreshold ? "ring-orange-200" : ""}
        />
      </div>

      {/* Month-start alert: flag unsettled balances */}
      {overdueDrivers.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
          <Bell size={18} className="text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">
              {overdueDrivers.length} {t("talabat.overdueMonthStart")}
            </p>
            <p className="text-xs text-red-500 mt-1">
              {t("talabat.overdueMonthDetail")}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {overdueDrivers.map((r) => (
                <span key={r.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-lg">
                  {parseRiderName(r.riderName).name}
                  <span className="font-mono font-bold">{formatCurrency(r.pendingDues, locale)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex gap-3 items-center">
        <input
          type="text"
          dir="auto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("talabat.searchRiderPlaceholder")}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 min-w-[280px]"
        />
        {companies.length > 0 && (
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
          >
            <option value="">{t("companies.allCompanies")}</option>
            {companies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <span className="text-sm text-secondary">{filtered.length} {t("talabat.riders")}</span>
      </div>

      {/* Main Ledger Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-start text-xs font-medium text-secondary px-4 py-3 whitespace-nowrap">{t("talabat.driverIdHeader")}</th>
                <th className="text-start text-xs font-medium text-secondary px-4 py-3 whitespace-nowrap">{t("talabat.riderNameHeader")}</th>
                <th className="text-start text-xs font-medium text-secondary px-4 py-3 whitespace-nowrap">{t("talabat.batchHeader")}</th>
                <th className="text-start text-xs font-medium text-secondary px-4 py-3 whitespace-nowrap">{t("talabat.companyHeader")}</th>
                <th className="text-start text-xs font-medium text-secondary px-4 py-3">{t("table.status")}</th>
                <th className="text-end text-xs font-medium text-secondary px-4 py-3 whitespace-nowrap">{t("talabat.collectedHeader")}</th>
                <th className="text-end text-xs font-medium text-secondary px-4 py-3 whitespace-nowrap">{t("talabat.depositHeader")}</th>
                <th className="text-end text-xs font-medium text-secondary px-4 py-3 whitespace-nowrap">{t("talabat.remainingBalanceHeader")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-secondary">
                    {t("talabat.noLedgerData")} {month}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const rowPending = hasDayFilter
                    ? sumForDays(row, "dailySales") - sumForDays(row, "dailyCollections")
                    : row.pendingDues;
                  const highDue = rowPending > cashThreshold;
                  return (
                    <>
                      <tr
                        key={row.id}
                        className={cn(
                          "border-b border-gray-50 transition-colors hover:bg-gray-50/50",
                          highDue && "bg-red-50/20"
                        )}
                      >
                        <td className="px-4 py-3 text-sm font-mono text-secondary">{row.riderId}</td>
                        <td className="px-4 py-3 text-sm font-medium">{parseRiderName(row.riderName).name}</td>
                        <td className="px-4 py-3 text-sm font-mono text-secondary">{parseRiderName(row.riderName).batch}</td>
                        <td className="px-4 py-3 text-sm text-secondary">{parseRiderName(row.riderName).company}</td>
                        <td className="px-4 py-3">
                          <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", {
                            "bg-green-50 text-green-600": row.status === "ACTIVE",
                            "bg-gray-100 text-gray-500": row.status === "INACTIVE",
                            "bg-red-50 text-red-600": row.status === "SUSPENDED",
                          })}>
                            {row.status === "ACTIVE" ? t("status.active")
                              : row.status === "INACTIVE" ? t("status.inactive")
                              : row.status === "SUSPENDED" ? t("status.suspended")
                              : row.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-end font-mono text-green-600 font-medium">
                          {kd(hasDayFilter ? sumForDays(row, "dailyCollections") : row.totalCollection)}
                        </td>
                        <td className="px-4 py-3 text-sm text-end font-mono text-blue-600 font-medium">
                          {hasDayFilter ? "-" : kd(row.cashAlMuzaini + row.bankTransfer)}
                        </td>
                        {(() => {
                          const pending = hasDayFilter
                            ? sumForDays(row, "dailySales") - sumForDays(row, "dailyCollections")
                            : row.pendingDues;
                          const isHigh = pending > cashThreshold;
                          return (
                            <td className="px-4 py-3 text-end">
                              <span className={cn(
                                "text-sm font-mono font-semibold",
                                isHigh ? "text-red-600" :
                                pending > 0 ? "text-orange-600" : "text-green-600"
                              )}>
                                {kd(pending)}
                              </span>
                              {isHigh && (
                                <AlertTriangle size={12} className="inline ms-1 text-red-500" />
                              )}
                            </td>
                          );
                        })()}
                      </tr>
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Deposit Modal */}
      {depositRider && (
        <DepositModal
          rider={depositRider}
          onClose={() => setDepositRider(null)}
          onSuccess={refetch}
        />
      )}
    </div>
  );
}
