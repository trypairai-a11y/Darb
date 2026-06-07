"use client";
import { useEffect, useState } from "react";
import ShortlistView, { ShortlistItem } from "@/components/shared/ShortlistView";
import { MOCK_MONEY } from "@/mocks/v2";

export default function MoneyPage() {
  const [loading, setLoading] = useState(true);
  useEffect(() => { setTimeout(() => setLoading(false), 300); }, []);

  const shortlistItems: ShortlistItem[] = [];

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
        <MoneyStat label="Cash pending" value={`KD ${MOCK_MONEY.cashPending.totalKd.toFixed(3)}`} sub={`${MOCK_MONEY.cashPending.records} records`} />
        <MoneyStat label="Cash reconciled (week)" value={`KD ${MOCK_MONEY.cashReconciled.totalKd.toFixed(0)}`} sub={`${MOCK_MONEY.cashReconciled.records} records`} />
      </div>

      <ShortlistView
        title="Money"
        subtitle="Cash collection and reconciliation overview."
        items={shortlistItems}
        loading={loading}
        browseContent={
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-secondary shadow-sm">
            Browse view — full cash ledger, billings, and tax invoices.
          </div>
        }
      />
    </div>
  );
}

function MoneyStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm transition-all hover:shadow-md">
      <p className="text-[11px] font-medium uppercase tracking-wider text-secondary">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-secondary">{sub}</p>
    </div>
  );
}
