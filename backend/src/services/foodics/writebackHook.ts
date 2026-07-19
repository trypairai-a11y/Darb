/**
 * Foodics status write-back hook (plan §A6).
 *
 * Soft seam between the orders-core track and the Foodics track: orderService
 * calls this on every milestone (ASSIGNED / PICKED_UP / DELIVERED /
 * CANCELLED), fire-and-forget. The SIGNATURE is owned by the orders-core
 * track; the BODY is owned by the Foodics track.
 *
 * Behaviour: no-op FAST unless the order is a Foodics-sourced order with a
 * FoodicsConnection — then enqueue a `foodics-writeback` BullMQ job
 * (attempts 5, exponential backoff; in-process fallback without Redis).
 * Terminal failure ⇒ OrderEvent + supervisor Notification (see
 * statusWriteback.recordWritebackFailure) — never blocks the lifecycle.
 */
import { prisma } from "../../config";
import { logger } from "../../config/logger";

export type FoodicsWritebackMilestone =
  | "ASSIGNED"
  | "PICKED_UP"
  | "DELIVERED"
  | "CANCELLED";

export async function enqueueFoodicsWriteback(
  orderId: string,
  milestone: FoodicsWritebackMilestone,
): Promise<void> {
  // Queue-side context has no tenant — the PK is globally unique; the
  // `tenantId: { not: "" }` filter satisfies the tenant guard while matching
  // any tenant by design.
  const order = await prisma.deliveryOrder.findFirst({
    where: { id: orderId, tenantId: { not: "" } },
    select: { source: true, foodicsOrderId: true, vendorId: true, tenantId: true },
  });
  if (!order || order.source !== "FOODICS" || !order.foodicsOrderId) return;

  const connection = await prisma.foodicsConnection.findFirst({
    where: { vendorId: order.vendorId, tenantId: order.tenantId },
    select: { id: true },
  });
  if (!connection) return;

  // Lazy require breaks the module-load cycle
  // orderService → writebackHook → foodicsWorker → orderService.
  const { enqueueFoodicsWritebackJob } =
    require("../../queues/foodicsWorker") as typeof import("../../queues/foodicsWorker");

  try {
    await enqueueFoodicsWritebackJob(orderId, milestone);
  } catch (err) {
    logger.warn({ err, orderId, milestone }, "foodics: writeback enqueue failed");
  }
}
