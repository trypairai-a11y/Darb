// Darb 2.0 — vendor "pause incoming orders" switch.
// Optimistic: flips immediately; pausing asks for confirmation first; a
// failed request rolls the switch back and raises an error toast.
"use client";
import { useEffect, useState } from "react";
import ConfirmModal from "@/components/shared/ConfirmModal";
import { useToast } from "@/components/shared/Toast";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";

interface PauseOrdersToggleProps {
  paused: boolean;
  /** Persist the new state (e.g. vendorApi.pause). Reject to roll back. */
  onChange: (paused: boolean) => Promise<unknown>;
  disabled?: boolean;
  className?: string;
}

export default function PauseOrdersToggle({
  paused,
  onChange,
  disabled,
  className,
}: PauseOrdersToggleProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [localPaused, setLocalPaused] = useState(paused);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLocalPaused(paused);
  }, [paused]);

  async function apply(next: boolean) {
    const previous = localPaused;
    setLocalPaused(next);
    setBusy(true);
    try {
      await onChange(next);
    } catch {
      setLocalPaused(previous);
      toast.error(t("vendorPortal.pauseFailed"));
    } finally {
      setBusy(false);
    }
  }

  function handleToggle() {
    if (disabled || busy) return;
    if (!localPaused) {
      // Pausing is disruptive — confirm first.
      setConfirming(true);
    } else {
      void apply(false);
    }
  }

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={localPaused}
        onClick={handleToggle}
        disabled={disabled || busy}
        className={cn(
          "inline-flex items-center gap-3 px-4 py-2 rounded-pill border text-sm font-medium transition-colors duration-250 ease-sierra-out disabled:opacity-50",
          localPaused
            ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
            : "bg-card border-sand-300 text-sand-800 hover:bg-sand-100",
          className
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative h-5 w-9 rounded-pill transition-colors duration-250",
            localPaused ? "bg-red-500" : "bg-sand-300"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-250",
              localPaused ? "start-[18px]" : "start-0.5"
            )}
          />
        </span>
        {localPaused ? t("vendorPortal.resumeOrders") : t("vendorPortal.pauseOrders")}
      </button>

      <ConfirmModal
        open={confirming}
        title={t("vendorPortal.pauseConfirmTitle")}
        message={t("vendorPortal.pauseConfirmMessage")}
        variant="warning"
        confirmLabel={t("vendorPortal.pauseOrders")}
        onConfirm={() => {
          setConfirming(false);
          void apply(true);
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
