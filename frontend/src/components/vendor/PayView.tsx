"use client";
// Revision 10 (#2) — the public page behind a top-up link. Outside (dashboard):
// no auth, no rail, the token in the URL is the only credential. Same shape and
// discipline as the customer tracking page.
//
// Two jobs. With a gateway configured it is a redirect: it says where it is
// sending you and sends you. Without one it is the payment instruction — the
// amount and a quotable reference — which is what a merchant actually needs to
// make the transfer. It never claims money has moved; only Darb confirming
// receipt or the gateway's own webhook does that, and both show as PAID here.
import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, Loader2, TriangleAlert, Wallet } from "lucide-react";
import { fetchTopUp, type PayPayload } from "@/lib/payApi";
import { useI18n } from "@/i18n/I18nProvider";
import { formatKwd } from "@/i18n/format";

export default function PayView({ token }: { token: string }) {
  const { t, locale } = useI18n();
  const [payload, setPayload] = useState<PayPayload | null>(null);
  const [error, setError] = useState<"NOT_FOUND" | "FAILED" | null>(null);

  useEffect(() => {
    let live = true;
    fetchTopUp(token)
      .then((p) => {
        if (!live) return;
        setPayload(p);
        // A real gateway link is where the payment actually happens, so go
        // there. Only for a top-up still awaiting one: redirecting away from a
        // PAID row would hide the confirmation the merchant came here for.
        if (p.gatewayUrl && p.status === "PENDING") {
          window.location.replace(p.gatewayUrl);
        }
      })
      .catch((err: Error) => {
        if (live) setError(err.message === "NOT_FOUND" ? "NOT_FOUND" : "FAILED");
      });
    return () => {
      live = false;
    };
  }, [token]);

  const card =
    "w-full max-w-md bg-card border border-sand-200 rounded-2xl shadow-soft p-6 space-y-5";

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-sand-100">
        <div className={card}>
          <div className="flex items-center gap-2.5 text-red-700">
            <TriangleAlert size={18} aria-hidden="true" />
            <p className="text-sm">
              {error === "NOT_FOUND" ? t("vendorPortal.payNotFound") : t("errors.serverError")}
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-sand-100">
        <div className="flex items-center gap-2.5 text-sand-600 text-sm">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          {t("common.loading")}
        </div>
      </main>
    );
  }

  // Revision 14b — the deposit rail calls a landed payment CONFIRMED, the
  // top-up rail calls it PAID. Both mean the same thing here: stop offering to
  // pay, and say it has arrived.
  const settled = payload.status !== "PENDING";
  const landed = payload.status === "PAID" || payload.status === "CONFIRMED";
  const isDeposit = payload.kind === "FLEET_DEPOSIT";
  const payer = payload.payerName ?? payload.vendorName;

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-sand-100">
      <div className={card}>
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 shrink-0 rounded-pill bg-primary-soft flex items-center justify-center text-primary">
            <Wallet size={16} aria-hidden="true" />
          </div>
          <h1 className="font-display text-lg text-sand-900">
            {isDeposit ? t("vendorPortal.payDepositTitle") : t("vendorPortal.payTitle")}
          </h1>
        </div>

        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-sand-600">{t("vendorPortal.payFor")}</dt>
            <dd dir="auto" className="font-medium text-sand-900">
              {payer}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-sand-600">{t("vendorPortal.payAmount")}</dt>
            <dd dir="ltr" className="font-display text-2xl text-sand-900 tabular-nums">
              {formatKwd(payload.amountKwd, locale)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-sand-600">{t("vendorPortal.payReference")}</dt>
            <dd dir="ltr" className="font-mono text-sand-900">
              {payload.reference}
            </dd>
          </div>
        </dl>

        {landed && (
          <p className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-green-200 bg-green-50 text-sm text-green-800">
            <CheckCircle2 size={15} aria-hidden="true" />
            {t("vendorPortal.payPaid")}
          </p>
        )}
        {(payload.status === "CANCELLED" || payload.status === "REJECTED") && (
          <p className="px-4 py-3 rounded-xl border border-sand-200 bg-sand-100 text-sm text-sand-700">
            {t("vendorPortal.payCancelled")}
          </p>
        )}
        {payload.status === "FAILED" && (
          <p className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
            {t("vendorPortal.payFailed")}
          </p>
        )}

        {!settled && payload.gatewayUrl && (
          <>
            <p className="flex items-center gap-2.5 text-sm text-sand-600">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              {t("vendorPortal.payRedirecting")}
            </p>
            {/* The redirect fires from the effect above. This is the way through
                for anyone whose browser blocked it. */}
            <a
              href={payload.gatewayUrl}
              className="inline-flex w-full items-center justify-center gap-1.5 h-11 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
            >
              <ArrowUpRight size={15} aria-hidden="true" />
              {t("vendorPortal.payOpenGateway")}
            </a>
          </>
        )}

        {!settled && !payload.gatewayUrl && (
          <div className="rounded-xl bg-sand-100 p-4 space-y-1.5">
            <p className="text-sm font-medium text-sand-900">
              {t("vendorPortal.payTransferTitle")}
            </p>
            <p className="text-xs text-sand-600">{t("vendorPortal.payTransferHint")}</p>
          </div>
        )}
      </div>
    </main>
  );
}
