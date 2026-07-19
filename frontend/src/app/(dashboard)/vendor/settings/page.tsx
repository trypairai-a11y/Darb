"use client";
// Darb 2.0 — /vendor/settings: pause incoming orders, Foodics POS connection
// (status + connect → authUrl redirect) and read-only profile from
// GET /api/vendor/me. All calls stay inside the /api/vendor/* allowlist.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import ErrorState from "@/components/shared/ErrorState";
import { PageSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";
import PauseOrdersToggle from "@/components/darb/PauseOrdersToggle";
import { vendorApi } from "@/lib/darbApi";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime } from "@/i18n/format";
import { cn } from "@/lib/cn";

export default function VendorSettingsPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);

  const meQuery = useQuery({
    queryKey: ["darb", "vendor", "me"],
    queryFn: () => vendorApi.me(),
    staleTime: 60_000,
  });

  const foodicsQuery = useQuery({
    queryKey: ["darb", "vendor", "foodics"],
    queryFn: () => vendorApi.foodicsStatus(),
    retry: false,
  });

  const vendor = meQuery.data?.vendor;
  const branches = useMemo(() => meQuery.data?.branches ?? [], [meQuery.data?.branches]);

  async function connectFoodics() {
    setConnecting(true);
    try {
      const { authUrl } = await vendorApi.foodicsConnect();
      if (authUrl) {
        window.location.href = authUrl;
        return;
      }
      toast.error(t("foodics.error"));
    } catch {
      toast.error(t("foodics.error"));
    } finally {
      setConnecting(false);
    }
  }

  if (meQuery.isLoading) return <PageSkeleton statCards={0} tableRows={5} tableCols={2} />;
  if (meQuery.error) {
    return (
      <ErrorState
        error={meQuery.error instanceof Error ? meQuery.error.message : t("errors.loadingData")}
        onRetry={() => meQuery.refetch()}
      />
    );
  }

  const status = foodicsQuery.data;
  const connected = status?.connected ?? status?.status === "CONNECTED";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-display-sm text-sand-900">
          {t("vendorPortal.settingsTitle")}
        </h1>
        <p className="text-sm text-sand-600 mt-1">{t("vendorPortal.settingsSubtitle")}</p>
      </div>

      {/* Pause */}
      <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6">
        <h2 className="font-medium text-sand-900">{t("vendorPortal.pauseSection")}</h2>
        <p className="text-xs text-sand-600 mt-1 mb-4">{t("vendorPortal.pauseHint")}</p>
        <PauseOrdersToggle
          paused={vendor?.isPaused ?? false}
          onChange={async (paused) => {
            await vendorApi.pause(paused);
            await queryClient.invalidateQueries({ queryKey: ["darb", "vendor", "me"] });
          }}
        />
      </section>

      {/* Foodics */}
      <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6">
        <h2 className="font-medium text-sand-900">{t("foodics.title")}</h2>
        <p className="text-xs text-sand-600 mt-1 mb-4">{t("foodics.connectHint")}</p>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wide text-sand-600 mb-1">
              {t("foodics.status")}
            </p>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-pill text-xs font-medium",
                connected ? "bg-green-50 text-green-700" : "bg-sand-100 text-sand-700"
              )}
            >
              <span
                aria-hidden="true"
                className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-green-500" : "bg-sand-400")}
              />
              {connected ? t("foodics.connected") : t("foodics.notConnected")}
            </span>
            {status?.lastEventAt && (
              <p className="text-xs text-sand-600 mt-1.5" dir="ltr">
                {t("foodics.lastEvent")}: {formatDateTime(status.lastEventAt, locale)}
              </p>
            )}
          </div>
          {!connected && (
            <button
              type="button"
              onClick={() => void connectFoodics()}
              disabled={connecting}
              className="inline-flex items-center gap-2 px-4 h-10 rounded-pill bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              <Link2 size={15} aria-hidden="true" />
              {connecting ? t("common.processing") : t("foodics.connect")}
            </button>
          )}
        </div>
      </section>

      {/* Profile (read-only) */}
      <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6">
        <h2 className="font-medium text-sand-900 mb-4">{t("vendorPortal.profile")}</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          <dt className="text-sand-600">{t("vendorsPage.name")}</dt>
          <dd dir="auto">{vendor?.name ?? "—"}</dd>
          <dt className="text-sand-600">{t("vendorsPage.nameAr")}</dt>
          <dd dir="auto">{vendor?.nameAr ?? "—"}</dd>
          <dt className="text-sand-600">{t("vendorsPage.code")}</dt>
          <dd dir="ltr" className="font-mono text-xs">
            {vendor?.code ?? "—"}
          </dd>
          <dt className="text-sand-600">{t("vendorsPage.phone")}</dt>
          <dd dir="ltr">{vendor?.phone ?? "—"}</dd>
          <dt className="text-sand-600">{t("vendorsPage.branches")}</dt>
          <dd>
            {branches.length === 0 ? (
              "—"
            ) : (
              <ul className="space-y-1">
                {branches.map((b) => (
                  <li key={b.id} dir="auto">
                    {b.name}
                    {b.zone && (
                      <span className="text-xs text-sand-500 ms-1.5">
                        ({locale === "ar" && b.zone.nameAr ? b.zone.nameAr : b.zone.name})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </dl>
      </section>
    </div>
  );
}
