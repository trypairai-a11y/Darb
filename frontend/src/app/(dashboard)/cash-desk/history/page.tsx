"use client";
// Darb 2.0 — /cash-desk/history: every hand-in that has been recorded.
//
// Same queries as the record screen, filtered by driver rather than scoped to
// the one being paid in, so a supervisor can answer "did Qadir hand in on
// Tuesday" without going anywhere near the ledger.
import CashDeskPanel from "@/components/cash/CashDeskPanel";
import { useI18n } from "@/i18n/I18nProvider";

export default function CashDeskHistoryPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("cashDesk.historyTitle")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("cashDesk.historySubtitle")}</p>
      </div>
      <CashDeskPanel view="history" />
    </div>
  );
}
