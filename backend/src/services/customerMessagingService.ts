// Darb 2.0 PRD §12 — the customer WhatsApp thread. One thread, Arabic and
// English, no app to install: milestone updates carry the co-branded
// tracking link ("delivered by Darb"); inbound replies route to rider
// support (see routes/webhooks.ts POST /twilio-whatsapp).
//
// Provider-agnostic: everything goes through notificationChannels.sendWhatsApp
// (Twilio today, stub-warns until TWILIO_* env is set — messages become real
// the moment credentials land, with zero code change here).
//
// Delivery discipline: fire-and-forget from post-commit call sites (beside
// fireFoodicsWriteback) — a messaging failure must never block the order
// lifecycle. Dedupe via an OrderEvent row per (order, milestone) so the
// serverless cron sweeps can retry lifecycle work without double-texting.

import { Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { sendWhatsApp } from "./notificationChannels";

export type CustomerMilestone =
  | "CREATED"
  | "ASSIGNED"
  | "PICKED_UP"
  | "DELIVERED"
  | "CANCELLED";

/**
 * The customer's tracking link. Exported because the staff order panel and the
 * merchant order detail both offer to resend it, and they have to produce the
 * exact string the customer was sent, not a plausible-looking rebuild of it.
 * The tracking page tells customers "the shop you ordered from can send it
 * again", which was untrue for any merchant working through the portal: the
 * token reached nobody but the WhatsApp message and the partner API response.
 */
export function trackingUrl(token: string | null): string | null {
  const base = process.env.PUBLIC_TRACKING_BASE_URL;
  if (!base || !token) return null;
  return `${base.replace(/\/+$/, "")}/track/${token}`;
}

/** Bilingual (EN + AR) message per milestone, co-branded per PRD §12. */
export function buildMilestoneMessage(args: {
  milestone: CustomerMilestone;
  vendorName: string;
  vendorNameAr?: string | null;
  orderNumber: string;
  driverName?: string | null;
  url?: string | null;
}): string {
  const { milestone, vendorName, orderNumber, url } = args;
  const vendorAr = args.vendorNameAr || vendorName;
  const driver = args.driverName?.split(" ")[0];
  const link = url ? `\n${url}` : "";

  switch (milestone) {
    case "CREATED":
      return (
        `${vendorName}: your order ${orderNumber} is confirmed — delivered by Darb.${link}\n` +
        `${vendorAr}: تم تأكيد طلبك ${orderNumber} — التوصيل عبر درب.`
      );
    case "ASSIGNED":
      return (
        `${vendorName}: ${driver ?? "your driver"} is on the way to pick up order ${orderNumber} — delivered by Darb. Track live:${link}\n` +
        `${vendorAr}: السائق ${driver ?? ""} في الطريق لاستلام طلبك ${orderNumber} — التوصيل عبر درب.`
      );
    case "PICKED_UP":
      return (
        `${vendorName}: order ${orderNumber} is out for delivery — delivered by Darb. Track live:${link}\n` +
        `${vendorAr}: طلبك ${orderNumber} في الطريق إليك — التوصيل عبر درب.`
      );
    case "DELIVERED":
      return (
        `${vendorName}: order ${orderNumber} was delivered. Rate your delivery or tip the driver:${link}\n` +
        `${vendorAr}: تم توصيل طلبك ${orderNumber}. قيّم التوصيل أو أكرم السائق.`
      );
    case "CANCELLED":
      return (
        `${vendorName}: order ${orderNumber} was cancelled. Reply here if you need help.\n` +
        `${vendorAr}: تم إلغاء طلبك ${orderNumber}. رد على هذه الرسالة إذا احتجت مساعدة.`
      );
  }
}

/**
 * Send the milestone message for an order. Loads the fresh row (call sites
 * only pass ids), skips silently when there is no customer phone, and
 * dedupes per (order, milestone) via an OrderEvent append.
 */
export async function notifyCustomerMilestone(
  orderId: string,
  tenantId: string,
  milestone: CustomerMilestone,
): Promise<void> {
  try {
    const order = await prisma.deliveryOrder.findFirst({
      where: { id: orderId, tenantId },
      select: {
        id: true,
        orderNumber: true,
        customerPhone: true,
        trackingToken: true,
        vendor: { select: { name: true, nameAr: true } },
        driver: { select: { name: true } },
      },
    });
    if (!order?.customerPhone) return;

    const action = `notify.whatsapp.${milestone.toLowerCase()}`;
    const already = await prisma.orderEvent.findFirst({
      where: { tenantId, orderId, action },
      select: { id: true },
    });
    if (already) return;

    const message = buildMilestoneMessage({
      milestone,
      vendorName: order.vendor.name,
      vendorNameAr: order.vendor.nameAr,
      orderNumber: order.orderNumber,
      driverName: order.driver?.name ?? null,
      url: trackingUrl(order.trackingToken),
    });

    const result = await sendWhatsApp(order.customerPhone, message);

    await prisma.orderEvent.create({
      data: {
        tenantId,
        orderId,
        action,
        description: `Customer WhatsApp ${milestone.toLowerCase()} update (${result.ok ? "sent" : "stubbed/failed"})`,
        operator: "system",
        timestamp: new Date(),
        metadata: { milestone, ok: result.ok } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.warn({ err, orderId, milestone }, "customer WhatsApp milestone failed");
  }
}

/** Fire-and-forget wrapper for lifecycle call sites (never throws). */
export function fireCustomerMilestone(
  orderId: string,
  tenantId: string,
  milestone: CustomerMilestone,
): void {
  void notifyCustomerMilestone(orderId, tenantId, milestone).catch(() => {});
}
