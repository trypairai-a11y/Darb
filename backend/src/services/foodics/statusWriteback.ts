/**
 * Foodics milestone status write-back (plan §A6).
 *
 * We run the LMD model (our drivers) — Foodics expects the fulfilment side
 * to write delivery milestones back: PUT /orders/{foodicsOrderId} with the
 * milestone timestamp field(s) + numeric delivery_status.
 *
 * ┌────────────┬────────────────────────────────────────────┬───────────────┐
 * │ Milestone  │ Timestamp fields (from DeliveryOrder cols) │ delivery_status│
 * ├────────────┼────────────────────────────────────────────┼───────────────┤
 * │ ASSIGNED   │ driver_assigned_at ← assignedAt            │ 3             │
 * │ PICKED_UP  │ driver_collected_at, dispatched_at ← pickedUpAt │ 4        │
 * │ DELIVERED  │ delivered_at ← deliveredAt                 │ 5             │
 * │ CANCELLED  │ (none)                                     │ 6             │
 * └────────────┴────────────────────────────────────────────┴───────────────┘
 *
 * !! The numeric delivery_status codes 1–6 are the DOCUMENTED assumption and
 * !! MUST be re-verified against the Foodics sandbox before go-live (as must
 * !! the timestamp format — ISO-8601 assumed here).
 *
 * Terminal failure (all BullMQ attempts exhausted): OrderEvent append
 * "foodics.writeback_failed" + Notification to supervisors — the order
 * lifecycle itself is NEVER blocked by write-back problems.
 */
import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";
import { logger } from "../../config/logger";
import { foodicsPut } from "./client";
import { FoodicsWritebackMilestone } from "./writebackHook";

// ─── Milestone table (single const source of truth, exported for tests) ────

type OrderTimestampColumn = "assignedAt" | "pickedUpAt" | "deliveredAt";

export interface MilestoneWritebackSpec {
  /** Foodics numeric delivery_status — RE-VERIFY 1–6 against sandbox. */
  delivery_status: number;
  /** Foodics body field → DeliveryOrder timestamp column it is read from. */
  timestampFields: Partial<Record<string, OrderTimestampColumn>>;
}

export const MILESTONE_WRITEBACK: Record<FoodicsWritebackMilestone, MilestoneWritebackSpec> = {
  ASSIGNED: {
    delivery_status: 3,
    timestampFields: { driver_assigned_at: "assignedAt" },
  },
  PICKED_UP: {
    delivery_status: 4,
    timestampFields: { driver_collected_at: "pickedUpAt", dispatched_at: "pickedUpAt" },
  },
  DELIVERED: {
    delivery_status: 5,
    timestampFields: { delivered_at: "deliveredAt" },
  },
  CANCELLED: {
    delivery_status: 6,
    timestampFields: {},
  },
};

/**
 * Build the PUT body for a milestone from the order row. Falls back to "now"
 * when the column is unexpectedly null (the write-back must still carry a
 * timestamp; the discrepancy is logged by the caller's order row anyway).
 */
export function buildWritebackBody(
  milestone: FoodicsWritebackMilestone,
  order: Partial<Record<OrderTimestampColumn, Date | string | null>>,
): Record<string, unknown> {
  const spec = MILESTONE_WRITEBACK[milestone];
  const body: Record<string, unknown> = { delivery_status: spec.delivery_status };
  for (const [apiField, column] of Object.entries(spec.timestampFields)) {
    const raw = column ? order[column] : null;
    const date = raw instanceof Date ? raw : raw ? new Date(raw) : new Date();
    body[apiField] = date.toISOString();
  }
  return body;
}

// ─── Write-back ────────────────────────────────────────────────────────────

export type WritebackResult =
  | { ok: true; body: Record<string, unknown> }
  | { skipped: string };

/**
 * Push one milestone to Foodics for an order. Skips (never throws) when the
 * order isn't a Foodics order or the connection can't serve the call; THROWS
 * on API failure so the BullMQ job retries (attempts 5, exp backoff).
 */
export async function writeBackMilestone(
  orderId: string,
  milestone: FoodicsWritebackMilestone,
): Promise<WritebackResult> {
  // Queue context has no tenant — the PK is globally unique; `tenantId: not ""`
  // satisfies the tenant guard while matching any tenant by design.
  const order = await prisma.deliveryOrder.findFirst({
    where: { id: orderId, tenantId: { not: "" } },
  });
  if (!order) return { skipped: "ORDER_NOT_FOUND" };
  if (order.source !== "FOODICS" || !order.foodicsOrderId) {
    return { skipped: "NOT_A_FOODICS_ORDER" };
  }

  const connection = await prisma.foodicsConnection.findFirst({
    where: { vendorId: order.vendorId, tenantId: order.tenantId },
  });
  if (!connection) return { skipped: "NO_CONNECTION" };
  if (connection.status !== "CONNECTED" || !connection.accessTokenEnc) {
    return { skipped: `CONNECTION_${connection.status}` };
  }

  const body = buildWritebackBody(milestone, order);
  await foodicsPut(connection, `/orders/${order.foodicsOrderId}`, body);
  logger.info(
    { orderId, foodicsOrderId: order.foodicsOrderId, milestone },
    "foodics: milestone written back",
  );
  return { ok: true, body };
}

// ─── Terminal failure handling ─────────────────────────────────────────────

/**
 * All write-back attempts exhausted: append an OrderEvent and notify
 * supervisors (mirrors the reconciliationService notification pattern).
 * Best-effort — never throws.
 */
export async function recordWritebackFailure(
  orderId: string,
  milestone: FoodicsWritebackMilestone,
  errorMessage: string,
): Promise<void> {
  try {
    const order = await prisma.deliveryOrder.findFirst({
      where: { id: orderId, tenantId: { not: "" } },
      select: { id: true, tenantId: true, orderNumber: true, foodicsOrderId: true },
    });
    if (!order) return;
    const { tenantId } = order;

    await prisma.orderEvent.create({
      data: {
        tenantId,
        orderId,
        action: "foodics.writeback_failed",
        description: `Foodics write-back failed for milestone ${milestone}: ${errorMessage}`,
        operator: "system",
        timestamp: new Date(),
        metadata: {
          milestone,
          foodicsOrderId: order.foodicsOrderId,
          error: errorMessage,
        } as Prisma.InputJsonValue,
      },
    });

    const supervisors = await prisma.user.findMany({
      where: { tenantId, role: { in: ["ADMIN", "OPS_MANAGER", "SUPERVISOR"] }, isActive: true },
      select: { id: true },
    });
    if (supervisors.length > 0) {
      await prisma.notification.createMany({
        data: supervisors.map((user) => ({
          tenantId,
          userId: user.id,
          title: "Foodics status update failed",
          message: `Order ${order.orderNumber}: the ${milestone} update could not be sent to Foodics after repeated attempts. The delivery itself is unaffected — the POS status is stale.`,
          type: "FOODICS_WRITEBACK_FAILED",
          severity: "HIGH",
          sourceId: orderId,
          metadata: {
            orderId,
            milestone,
            foodicsOrderId: order.foodicsOrderId,
            error: errorMessage,
          } as unknown as Prisma.InputJsonValue,
        })),
      });
    }
  } catch (err) {
    logger.error({ err, orderId, milestone }, "foodics: failed to record write-back failure");
  }
}
