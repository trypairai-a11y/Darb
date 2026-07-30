"use client";
// Revision 10 (#2) — the merchant Top up flow.
//
// What it replaces: a modal that told the shop to make a bank transfer quoting
// its shop code, and somebody at Darb reconciling it by hand afterwards. The
// client asked for the system to suggest an amount, let the shop change it, and
// then take them straight to a payment link.
//
// The suggestion comes from the server, not from here: it is what the shop owes
// plus about a week of its own delivery fees, which is a number this component
// has no business inventing. Confirm creates the top-up and opens the link.
//
// With a payment gateway configured the link is the gateway's own checkout and
// the webhook credits the wallet. Without one it is the Darb payment page for
// that top-up, carrying the amount and a quotable reference, and Darb credits
// the wallet when the transfer lands. The button never lies about which of the
// two happened: the pending panel says what to expect.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Loader2, Wallet } from "lucide-react";
import SlidePanel from "@/components/shared/SlidePanel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useToast } from "@/components/shared/Toast";
import { vendorApi } from "@/lib/darbApi";
import type { VendorTopUp, VendorTopUpStatus } from "@/types/darb";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime, formatKwd } from "@/i18n/format";

const inputClass =
  "w-full px-3 h-11 rounded-xl bg-white border border-sand-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20";

interface TopUpPanelProps {
  open: boolean;
  onClose: () => void;
  /** Server suggestion, as a 3dp string. The field prefills with it. */
  suggestedKwd?: string | number | null;
  /** What the shop owes right now, shown as the reason for the suggestion. */
  outstandingKwd?: string | number | null;
}

export default function TopUpPanel({
  open,
  onClose,
  suggestedKwd,
  outstandingKwd,
}: TopUpPanelProps) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<VendorTopUp | null>(null);

  // Prefill on open, and re-prefill if the suggestion arrives after the panel
  // does. Not on every render: the merchant's own edit has to survive a refetch.
  useEffect(() => {
    if (!open) return;
    setCreated(null);
    if (suggestedKwd != null) setAmount(String(Number(suggestedKwd).toFixed(3)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, suggestedKwd]);

  const historyQuery = useQuery({
    queryKey: ["darb", "vendor", "top-ups"],
    queryFn: () => vendorApi.topUps(),
    enabled: open,
  });

  const valid = /^\d{1,7}(\.\d{1,3})?$/.test(amount) && Number(amount) > 0;

  async function confirm() {
    if (!valid) return;
    setBusy(true);
    try {
      const topUp = await vendorApi.createTopUp(amount);
      setCreated(topUp);
      await queryClient.invalidateQueries({ queryKey: ["darb", "vendor", "top-ups"] });
      // Open the link in a new tab rather than replacing the portal: the shop
      // needs the reference on this screen while it pays on the other one.
      if (topUp.paymentUrl) window.open(topUp.paymentUrl, "_blank", "noopener");
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          t("toast.failedSave"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    try {
      await vendorApi.cancelTopUp(id);
      toast.success(t("vendorPortal.topUpCancelled"));
      setCreated(null);
      await queryClient.invalidateQueries({ queryKey: ["darb", "vendor", "top-ups"] });
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          t("toast.failedSave"),
      );
    }
  }

  const statusLabel = (s: VendorTopUpStatus) => t(`vendorPortal.topUpStatus${s}`);
  const history = historyQuery.data ?? [];
  const owed = Number(outstandingKwd ?? 0);

  return (
    <SlidePanel open={open} onClose={onClose} title={t("vendorPortal.topUp")}>
      <div className="space-y-6">
        {created ? (
          // ── Created: the link, the reference, and what happens next ──
          <section className="space-y-4">
            <div className="rounded-xl border border-primary/15 bg-primary-soft p-4 space-y-2">
              <p className="text-sm font-medium text-sand-900">
                {t("vendorPortal.topUpPendingTitle")}
              </p>
              <p dir="ltr" className="text-display-sm font-display text-sand-900 tabular-nums">
                {formatKwd(created.amountKwd, locale)}
              </p>
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-sand-600">
                  {t("vendorPortal.topUpReference2")}
                </p>
                <p dir="ltr" className="font-mono text-sm text-sand-900">
                  {created.reference}
                </p>
              </div>
            </div>

            {created.paymentUrl && (
              <a
                href={created.paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-1.5 h-11 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
              >
                <ArrowUpRight size={15} aria-hidden="true" />
                {t("vendorPortal.topUpOpenLink")}
              </a>
            )}

            {/* Only shown on the manual rail. With a gateway the checkout page
                says what to do and repeating it here would contradict it. */}
            {created.provider !== "MYFATOORAH" && (
              <p className="text-xs text-sand-600">{t("vendorPortal.topUpManualHint")}</p>
            )}

            <button
              type="button"
              onClick={() => void cancel(created.id)}
              className="text-xs text-sand-600 hover:text-sand-900 underline underline-offset-2"
            >
              {t("vendorPortal.topUpCancel")}
            </button>
          </section>
        ) : (
          // ── Amount: suggested, editable, then straight to the link ──
          <section className="space-y-4">
            <div>
              <label
                htmlFor="darb-topup-amount"
                className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide"
              >
                {t("vendorPortal.topUpAmount")} *
              </label>
              <input
                id="darb-topup-amount"
                type="text"
                inputMode="decimal"
                dir="ltr"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                className={inputClass}
                autoFocus
              />
              {amount !== "" && !valid && (
                <p className="mt-1.5 text-xs text-red-600">
                  {t("vendorPortal.topUpAmountInvalid")}
                </p>
              )}
            </div>

            {suggestedKwd != null && (
              <div className="rounded-xl bg-sand-100 p-4 text-sm space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sand-700">{t("vendorPortal.topUpSuggested")}</span>
                  <span dir="ltr" className="font-medium text-sand-900 tabular-nums">
                    {formatKwd(suggestedKwd, locale)}
                  </span>
                </div>
                {owed > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sand-700">{t("vendorPortal.topUpOutstanding")}</span>
                    <span dir="ltr" className="font-medium text-sand-900 tabular-nums">
                      {formatKwd(owed, locale)}
                    </span>
                  </div>
                )}
                <p className="text-xs text-sand-600">{t("vendorPortal.topUpWhySuggested")}</p>
                <button
                  type="button"
                  onClick={() => setAmount(String(Number(suggestedKwd).toFixed(3)))}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {t("vendorPortal.topUpUseSuggested")}
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={!valid || busy}
              onClick={() => void confirm()}
              className="inline-flex w-full items-center justify-center gap-1.5 h-11 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {busy ? (
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              ) : (
                <Wallet size={15} aria-hidden="true" />
              )}
              {busy ? t("common.processing") : t("vendorPortal.topUpContinue")}
            </button>
          </section>
        )}

        {/* History. An unpaid link from yesterday is reopenable rather than
            something the shop has to raise again from scratch. */}
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-sand-900">
            {t("vendorPortal.topUpHistory")}
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-sand-600">{t("errors.noData")}</p>
          ) : (
            <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200">
              {history.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p dir="ltr" className="text-sm text-sand-900 tabular-nums">
                      {formatKwd(row.amountKwd, locale)}
                    </p>
                    <p dir="ltr" className="text-xs text-sand-500 font-mono">
                      {row.reference}
                      {row.createdAt && (
                        <span className="ms-2 font-sans">
                          {formatDateTime(row.createdAt, locale)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {row.status === "PENDING" && row.paymentUrl && (
                      <a
                        href={row.paymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {t("vendorPortal.topUpOpenLink")}
                      </a>
                    )}
                    <StatusBadge status={row.status} label={statusLabel(row.status)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </SlidePanel>
  );
}
