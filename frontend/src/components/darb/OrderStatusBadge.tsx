// Darb 2.0 — DeliveryOrderStatus badge. Wraps the shared StatusBadge with an
// explicit status→color map (cn/twMerge lets our classes win) and localized
// labels from the darbOrderStatus namespace.
"use client";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import type { DeliveryOrderStatus } from "@/types/darb";

const STATUS_STYLES: Record<DeliveryOrderStatus, string> = {
  CREATED: "bg-sand-200 text-sand-800",
  REJECTED: "bg-red-50 text-red-600",
  DISPATCHING: "bg-blue-50 text-blue-600",
  NO_DRIVER: "bg-orange-50 text-orange-600",
  ASSIGNED: "bg-indigo-50 text-indigo-600",
  PICKED_UP: "bg-amber-50 text-amber-700",
  DELIVERED: "bg-green-50 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

const STATUS_I18N: Record<DeliveryOrderStatus, string> = {
  CREATED: "darbOrderStatus.created",
  REJECTED: "darbOrderStatus.rejected",
  DISPATCHING: "darbOrderStatus.dispatching",
  NO_DRIVER: "darbOrderStatus.noDriver",
  ASSIGNED: "darbOrderStatus.assigned",
  PICKED_UP: "darbOrderStatus.pickedUp",
  DELIVERED: "darbOrderStatus.delivered",
  FAILED: "darbOrderStatus.failed",
  CANCELLED: "darbOrderStatus.cancelled",
};

interface OrderStatusBadgeProps {
  status: DeliveryOrderStatus | string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}

export default function OrderStatusBadge({ status, size = "sm", className }: OrderStatusBadgeProps) {
  const { t } = useI18n();
  const known = status && status in STATUS_STYLES ? (status as DeliveryOrderStatus) : null;
  return (
    <StatusBadge
      status={status ?? undefined}
      label={known ? t(STATUS_I18N[known]) : undefined}
      size={size}
      showDot={false}
      className={known ? `${STATUS_STYLES[known]} ${className ?? ""}` : className}
    />
  );
}
