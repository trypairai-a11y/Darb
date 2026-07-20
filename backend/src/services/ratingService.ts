// Darb 2.0 PRD §12 — customer ratings. 1-5 stars + optional comment from the
// tracking link, once per order (OrderRating.orderId unique). Low ratings
// (≤2 stars) feed the driver violation ladder (LOW_CUSTOMER_RATING) so the
// PRD §9 discipline flow picks them up like any other violation.

import { OrderRating } from "../generated/prisma";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { createViolationWithAlert } from "./violationEngine";
import { publishOrderEvent } from "./orderStateMachine";

export class RatingError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = "RatingError";
  }
}

export const LOW_RATING_THRESHOLD = 2;

export async function submitRating(args: {
  tenantId: string;
  orderId: string;
  stars: number;
  comment?: string;
}): Promise<OrderRating> {
  const { tenantId, orderId, comment } = args;
  const stars = Math.trunc(args.stars);
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
    throw new RatingError("stars must be an integer from 1 to 5");
  }

  const order = await prisma.deliveryOrder.findFirst({
    where: { id: orderId, tenantId },
    select: {
      id: true,
      status: true,
      driverId: true,
      orderNumber: true,
      vendorId: true,
    },
  });
  if (!order) throw new RatingError("Order not found", 404);
  if (order.status !== "DELIVERED" || !order.driverId) {
    throw new RatingError("Only delivered orders can be rated", 409);
  }

  let rating: OrderRating;
  try {
    rating = await prisma.orderRating.create({
      data: {
        tenantId,
        orderId,
        driverId: order.driverId,
        stars,
        comment: comment?.trim().slice(0, 500) || null,
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") {
      throw new RatingError("This order has already been rated", 409);
    }
    throw err;
  }

  // PRD §12: "ratings feed the driver violation engine". Fire-and-forget —
  // a violation hiccup must never lose the customer's rating.
  if (stars <= LOW_RATING_THRESHOLD) {
    void createViolationWithAlert({
      tenantId,
      driverId: order.driverId,
      platform: "DARB",
      violationType: "LOW_CUSTOMER_RATING",
      violationTime: new Date(),
      details: `Customer rated order ${order.orderNumber} ${stars}/5${comment ? `: "${comment.trim().slice(0, 200)}"` : ""}`,
      metadata: { orderId, stars },
      taskId: orderId,
    }).catch((err) =>
      logger.warn({ err, orderId }, "low-rating violation creation failed"),
    );
  }

  publishOrderEvent(tenantId, "order.rated", {
    orderId,
    orderNumber: order.orderNumber,
    vendorId: order.vendorId,
    driverId: order.driverId,
    stars,
  });

  return rating;
}

/** Aggregate rating for a driver, computed on read (no cache column). */
export async function getDriverRating(
  tenantId: string,
  driverId: string,
): Promise<{ avg: number | null; count: number }> {
  const agg = await prisma.orderRating.aggregate({
    where: { tenantId, driverId },
    _avg: { stars: true },
    _count: { _all: true },
  });
  return {
    avg: agg._avg.stars != null ? Number(agg._avg.stars.toFixed(2)) : null,
    count: agg._count._all,
  };
}
