"use client";
// Darb 2.0 — /cash-desk: recording cash a driver hands in.
//
// Revision 4 (#3). This was a tab on the Money screen. The client asked for it
// to be "a different portal for cash collection only", and they are right that
// it is a different job: the person counting notes at the end of a shift has no
// business in the ledger, the shop statements or the nightly checks, and the
// accountant reading those does not want a cash form in the way.
//
// The old ?tab=cash deep link redirects here, so the Driver cash stat card on
// the Money screen still lands where it always did.
import CashDeskPanel from "@/components/cash/CashDeskPanel";
import { useI18n } from "@/i18n/I18nProvider";

export default function CashDeskPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">{t("cashDesk.title")}</h1>
        <p className="text-sm text-sand-600 mt-1">{t("cashDesk.subtitle")}</p>
      </div>
      <CashDeskPanel view="record" />
    </div>
  );
}
