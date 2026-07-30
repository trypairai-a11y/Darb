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
import { useVendorBranch } from "@/contexts/VendorBranchContext";
import { vendorApi } from "@/lib/darbApi";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateTime } from "@/i18n/format";
import { cn } from "@/lib/cn";

// v1 slim-down: Foodics UI stays hidden until the partner app is approved.
const FOODICS_UI = false;

export default function VendorSettingsPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const { inspectVendorId } = useVendorBranch();

  const meQuery = useQuery({
    queryKey: ["darb", "vendor", "me"],
    queryFn: () => vendorApi.me(),
    staleTime: 60_000,
  });

  const foodicsQuery = useQuery({
    queryKey: ["darb", "vendor", "foodics"],
    queryFn: () => vendorApi.foodicsStatus(),
    retry: false,
    enabled: FOODICS_UI,
  });

  const vendor = meQuery.data;
  const branches = useMemo(() => meQuery.data?.branches ?? [], [meQuery.data?.branches]);
  // Revision 10 (#7). "" means the whole account, which is what the toggle
  // always did and stays the default.
  const [pauseBranchId, setPauseBranchId] = useState("");
  const pausedBranchNames = useMemo(
    () => branches.filter((b) => b.isPaused).map((b) => b.name),
    [branches],
  );

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

      {/* Pause. Hidden from an inspecting admin, whose POST would be
          refused: pausing a merchant is a staff action with its own
          endpoint, not something to do from inside their portal. */}
      {!inspectVendorId && (
      <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6">
        <h2 className="font-medium text-sand-900">{t("vendorPortal.pauseSection")}</h2>
        <p className="text-xs text-sand-600 mt-1 mb-4">{t("vendorPortal.pauseHint")}</p>

        {/* Revision 10 (#7). One switch used to stop the whole account, so a
            shop with a queue at one counter had to refuse orders everywhere.
            The scope picker is only worth drawing for a shop that has more than
            one branch; a single-branch shop keeps the plain toggle. */}
        {branches.length > 1 && (
          <>
            <div className="flex gap-1 bg-sand-100 rounded-pill p-1 w-fit mb-3 flex-wrap">
              <button
                type="button"
                onClick={() => setPauseBranchId("")}
                className={cn(
                  "px-4 h-9 text-sm font-medium rounded-pill transition-colors",
                  pauseBranchId === ""
                    ? "bg-white text-sand-900 shadow-soft"
                    : "text-sand-600 hover:text-sand-900",
                )}
              >
                {t("vendorPortal.pauseScopeAll")}
              </button>
              {branches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setPauseBranchId(b.id)}
                  className={cn(
                    "px-4 h-9 text-sm font-medium rounded-pill transition-colors",
                    pauseBranchId === b.id
                      ? "bg-white text-sand-900 shadow-soft"
                      : "text-sand-600 hover:text-sand-900",
                  )}
                >
                  <span dir="auto">{b.name}</span>
                  {b.isPaused && (
                    <span
                      aria-hidden="true"
                      className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 ms-1.5 align-middle"
                    />
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-sand-600 mb-4">{t("vendorPortal.pauseBranchHint")}</p>
          </>
        )}

        <PauseOrdersToggle
          // The account-wide switch pauses every counter on top of the branch
          // flags, so a branch inside a paused account reads as paused here
          // rather than claiming to be taking orders it would in fact refuse.
          paused={
            pauseBranchId === ""
              ? (vendor?.isPaused ?? false)
              : (vendor?.isPaused ?? false) ||
                (branches.find((b) => b.id === pauseBranchId)?.isPaused ?? false)
          }
          // A branch cannot be resumed while the whole account is paused: the
          // switch would flip and orders would still be refused.
          disabled={pauseBranchId !== "" && (vendor?.isPaused ?? false)}
          onChange={async (paused) => {
            await vendorApi.pause(paused, pauseBranchId || undefined);
            await queryClient.invalidateQueries({ queryKey: ["darb", "vendor", "me"] });
          }}
        />

        {pausedBranchNames.length > 0 && pauseBranchId === "" && !vendor?.isPaused && (
          <p dir="auto" className="mt-3 text-xs text-red-700">
            {t("vendorPortal.pausedBranches")}: {pausedBranchNames.join(", ")}
          </p>
        )}
      </section>
      )}

      {/* Foodics — hidden until the Foodics partner app is approved (v1 slim-down).
          Flip to true once sandbox/production credentials exist. */}
      {FOODICS_UI && (
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
      )}

      {/* Profile (read-only) */}
      <section className="bg-card border border-sand-200 rounded-2xl shadow-soft p-6">
        <h2 className="font-medium text-sand-900 mb-4">{t("vendorPortal.profile")}</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          <dt className="text-sand-600">{t("vendorsPage.name")}</dt>
          <dd dir="auto">{vendor?.name ?? t("common.notAvailable")}</dd>
          <dt className="text-sand-600">{t("vendorsPage.nameAr")}</dt>
          <dd dir="auto">{vendor?.nameAr ?? t("common.notAvailable")}</dd>
          <dt className="text-sand-600">{t("vendorsPage.code")}</dt>
          <dd dir="ltr" className="font-mono text-xs">
            {vendor?.code ?? t("common.notAvailable")}
          </dd>
          <dt className="text-sand-600">{t("vendorsPage.phone")}</dt>
          <dd dir="ltr">{vendor?.phone ?? t("common.notAvailable")}</dd>
          <dt className="text-sand-600">{t("vendorsPage.branches")}</dt>
          <dd>
            {branches.length === 0 ? (
              t("common.notAvailable")
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
