"use client";
import { useEffect, useRef } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/I18nProvider";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  /** Extra content between the message and the buttons — e.g. a reason field. */
  children?: React.ReactNode;
  /** Block confirmation until the caller's own input is valid. */
  confirmDisabled?: boolean;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "danger",
  onConfirm,
  onCancel,
  loading = false,
  children,
  confirmDisabled = false,
}: ConfirmModalProps) {
  const { t } = useI18n();
  const resolvedConfirm = confirmLabel ?? t("actions.confirm");
  const resolvedCancel = cancelLabel ?? t("common.cancel");
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => confirmRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const iconColors = {
    danger: "bg-red-100 text-red-600",
    warning: "bg-amber-100 text-amber-700",
    default: "bg-primary/10 text-primary",
  };

  const confirmColors = {
    danger: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
    warning: "bg-amber-500 hover:bg-amber-600 focus:ring-amber-400",
    default: "bg-primary hover:bg-primary-hover focus:ring-primary",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-message"
    >
      <div
        className="absolute inset-0 bg-forest-900/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      <div className="relative bg-card rounded-2xl border border-sand-200 shadow-float w-full max-w-md p-6 animate-in fade-in slide-in-from-bottom-4 duration-250">
        <button
          onClick={onCancel}
          className="absolute top-4 end-4 p-1.5 rounded-pill text-sand-500 hover:text-sand-900 hover:bg-sand-100 transition-colors duration-250 ease-sierra-out"
          aria-label={t("common.close")}
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-4">
          <div className={cn("w-11 h-11 rounded-full flex items-center justify-center shrink-0", iconColors[variant])}>
            {variant === "danger" ? <Trash2 size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
          </div>

          <div className="flex-1 min-w-0">
            <h2 id="confirm-modal-title" className="font-display text-xl text-sand-900 leading-tight">
              {title}
            </h2>
            <p id="confirm-modal-message" className="mt-1.5 text-sm text-sand-700 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        {children && <div className="mt-4">{children}</div>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-5 h-10 text-sm font-medium text-sand-800 bg-sand-100 hover:bg-sand-200 rounded-pill transition-colors duration-250 ease-sierra-out disabled:opacity-50"
          >
            {resolvedCancel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
            className={cn(
              "px-5 h-10 text-sm font-medium text-white rounded-pill transition-colors duration-250 ease-sierra-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-card disabled:opacity-50",
              confirmColors[variant]
            )}
          >
            {loading ? t("common.processing") : resolvedConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
