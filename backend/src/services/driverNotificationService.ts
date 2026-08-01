/**
 * Driver-facing notifications (client request, 2026-08-01).
 *
 * "I need a place for notifications" needs two halves, and the screen is the
 * easy one. A feed nothing writes to is an empty screen that looks broken, so
 * this is the writing half: one helper, called from the few moments a driver
 * genuinely wants to be told something.
 *
 * Deliberately NOT a firehose. A driver reading their phone between drops will
 * stop reading a list that fills with noise, and then the one message that
 * mattered is buried. What earns a row here is something that changed for them
 * and that they did not do themselves: work arriving, and money moving.
 *
 * Every write is best-effort. A notification that fails to insert must never
 * take down the dispatch or the ledger posting it was describing, so callers
 * fire and forget and the failure is swallowed here rather than at each site.
 */
import { prisma } from "../config";
import { logger } from "../config/logger";

export type DriverNotificationType =
  | "ORDER_ASSIGNED"
  | "CASH_SETTLED"
  | "TICKET_UPDATE"
  | "SHIFT_UPDATE";

export interface DriverNotificationInput {
  tenantId: string;
  driverId: string;
  type: DriverNotificationType;
  title: string;
  message: string;
  /** Arabic pair. Both or neither: a half-translated row reads worse than none. */
  titleAr?: string;
  bodyAr?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH";
  sourceId?: string;
}

/**
 * Write one notification for one driver. Never throws.
 *
 * Callers are inside order transitions and wallet postings, so the contract has
 * to be that this cannot fail the caller. It is awaited nowhere that matters.
 */
export async function notifyDriver(input: DriverNotificationInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        driverId: input.driverId,
        title: input.title,
        message: input.message,
        type: input.type,
        severity: input.severity ?? "MEDIUM",
        sourceId: input.sourceId ?? null,
        titleAr: input.titleAr ?? null,
        bodyAr: input.bodyAr ?? null,
      },
    });
  } catch (err) {
    logger.warn({ err, driverId: input.driverId, type: input.type }, "driver notification failed");
  }
}

/** A delivery has landed on this driver. */
export function notifyOrderAssigned(args: {
  tenantId: string;
  driverId: string;
  orderId: string;
  orderNumber: string;
}): void {
  void notifyDriver({
    tenantId: args.tenantId,
    driverId: args.driverId,
    type: "ORDER_ASSIGNED",
    sourceId: args.orderId,
    title: "New delivery",
    message: `Order ${args.orderNumber} is yours. Open the app to start.`,
    titleAr: "طلب جديد",
    bodyAr: `الطلب ${args.orderNumber} أصبح لك. افتح التطبيق للبدء.`,
  });
}

/**
 * The driver's delivery company covered their cash out of its own account.
 *
 * Worth telling them precisely because they did nothing: their balance dropped
 * without them walking to a cash desk, and an unexplained drop is the kind of
 * thing that starts a phone call to a supervisor.
 */
export function notifyCashSettled(args: {
  tenantId: string;
  driverId: string;
  amountKwd: string;
  remittanceId: string;
}): void {
  void notifyDriver({
    tenantId: args.tenantId,
    driverId: args.driverId,
    type: "CASH_SETTLED",
    sourceId: args.remittanceId,
    severity: "LOW",
    title: "Cash cleared",
    message: `Your company settled KD ${args.amountKwd} of the cash you were carrying.`,
    titleAr: "تمت تسوية النقد",
    bodyAr: `سدّدت شركتك ${args.amountKwd} د.ك من النقد الذي بحوزتك.`,
  });
}
