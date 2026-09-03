/**
 * Darb 2.0 order state machine (plan §A2).
 *
 * Coarse FSM:
 *   CREATED →(auto) DISPATCHING →(accept) ASSIGNED → ARRIVED → PICKED_UP → DELIVERED
 *   CREATED → REJECTED (validation; rejected rows are usually INSERTED as
 *             REJECTED by orderService — the transition exists for
 *             completeness)
 *   REJECTED → CREATED (supervisor PATCH /:id/dropoff re-quote re-entry)
 *   DISPATCHING → NO_DRIVER (offer rounds exhausted)
 *   NO_DRIVER → DISPATCHING (redispatch) | ASSIGNED (manual assign)
 *   ASSIGNED | PICKED_UP → FAILED (driver, reason)
 *   → CANCELLED (vendor pre-pickup; supervisor any pre-DELIVERED)
 *
 * Granular driver milestones (heading / arrived) are OrderEvents only —
 * never statuses.
 *
 * Concurrency: every transition is a status-guarded `updateMany` — the WHERE
 * clause pins {id, tenantId, status: from}, so count === 0 means someone
 * else won the race (accept-vs-expire, double-tap, concurrent cancel) and an
 * OrderStateConflictError is thrown (routes map it to HTTP 409). This single
 * guard resolves every race — no advisory locks needed.
 *
 * SSE: transitionOrder COLLECTS the §A7 event for the transition into a
 * WeakMap keyed by the transaction client; the event must only reach
 * subscribers AFTER the surrounding transaction commits, so the caller calls
 * `flushOrderEvents(tx)` right after `prisma.$transaction` resolves. If the
 * transaction rolls back the collected events are simply never flushed (the
 * WeakMap entry is garbage-collected with the tx object — no leak, no ghost
 * event). Callers that publish §A7 events themselves can skip the flush and
 * use `publishOrderEvent` directly.
 */
import { DeliveryOrderStatus, Prisma } from "../generated/prisma";
import { logger } from "../config/logger";
import { DarbEventType, publishEvent } from "./eventBus";

// ─── Actor ──────────────────────────────────────────────────────────────────

export type OrderActor = {
  type: "SYSTEM" | "DRIVER" | "USER" | "VENDOR";
  id?: string;
  name?: string;
};

export const SYSTEM_ACTOR: OrderActor = { type: "SYSTEM", name: "system" };

// ─── Errors ─────────────────────────────────────────────────────────────────

/** Guarded transition lost the race (or the from→to pair is illegal) → 409. */
export class OrderStateConflictError extends Error {
  constructor(
    public readonly orderId: string,
    public readonly from: DeliveryOrderStatus,
    public readonly to: DeliveryOrderStatus,
  ) {
    super(
      `Order ${orderId} could not transition ${from} → ${to} (state changed concurrently or transition not allowed)`,
    );
    this.name = "OrderStateConflictError";
  }
}

// ─── Transition table (pure, unit-testable) ────────────────────────────────

export const ALLOWED: Record<DeliveryOrderStatus, DeliveryOrderStatus[]> = {
  CREATED: ["DISPATCHING", "REJECTED", "CANCELLED"],
  // Supervisor PATCH /:id/dropoff fixes coords on a rejected order and
  // re-enters the pipeline via CREATED.
  REJECTED: ["CREATED"],
  DISPATCHING: ["ASSIGNED", "NO_DRIVER", "CANCELLED"],
  NO_DRIVER: ["DISPATCHING", "ASSIGNED", "CANCELLED"],
  // Revision 8 (#3) inserted ARRIVED between accepting and collecting, so a
  // shop can see a courier is standing at its counter. ASSIGNED → PICKED_UP
  // stays legal: a driver who collects without tapping Arrived, and every
  // order already in flight when this shipped, must still be able to finish.
  // Client note (2026-08-31, emergency handling): HQ may take a pre-pickup
  // order off a driver who reported an emergency and send it back through
  // dispatch. Pre-pickup only — once the driver holds the bag (PICKED_UP)
  // there is nothing at the shop for a replacement driver to collect, so that
  // path stays fail-then-return.
  ASSIGNED: ["ARRIVED", "PICKED_UP", "FAILED", "CANCELLED", "DISPATCHING"],
  ARRIVED: ["PICKED_UP", "FAILED", "CANCELLED", "DISPATCHING"],
  PICKED_UP: ["DELIVERED", "FAILED", "CANCELLED"],
  // PRD §6 return-to-merchant: after a FAILED delivery (customer unreachable)
  // rider support authorises the return. FAILED is no longer terminal.
  FAILED: ["RETURNED"],
  // Terminal states:
  DELIVERED: [],
  CANCELLED: [],
  RETURNED: [],
};

/** Pure legality check for a from→to pair. */
export function isTransitionAllowed(
  from: DeliveryOrderStatus,
  to: DeliveryOrderStatus,
): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

// ─── §A7 SSE mapping ────────────────────────────────────────────────────────

/**
 * DarbEventType published for a transition INTO the given status. DISPATCHING
 * and CREATED have no per-transition event — "order.created" is published by
 * orderService when the row first enters the pipeline.
 */
const SSE_TYPE_FOR_STATUS: Partial<Record<DeliveryOrderStatus, DarbEventType>> = {
  REJECTED: "order.rejected",
  ASSIGNED: "order.assigned",
  ARRIVED: "order.arrived",
  PICKED_UP: "order.picked_up",
  DELIVERED: "order.delivered",
  FAILED: "order.failed",
  CANCELLED: "order.cancelled",
  NO_DRIVER: "order.dispatch_exhausted",
  RETURNED: "order.returned",
};

interface PendingSseEvent {
  tenantId: string;
  type: DarbEventType;
  payload: Record<string, unknown>;
}

// Keyed by the Prisma transaction client object — one pending list per
// in-flight interactive transaction.
const pendingByTx = new WeakMap<object, PendingSseEvent[]>();

/**
 * Publish an §A7 event on the tenant SSE channel (fire-and-forget; failures
 * are logged, never thrown). ALWAYS include vendorId in the payload when
 * known — vendor-scoped SSE filtering in routes/events.ts depends on it.
 */
export function publishOrderEvent(
  tenantId: string,
  type: DarbEventType,
  payload: Record<string, unknown>,
): void {
  void publishEvent({
    type,
    tenantId,
    payload,
    timestamp: new Date().toISOString(),
  }).catch((err) => logger.warn({ err, type }, "publishOrderEvent failed"));
}

/**
 * Flush the SSE events collected by transitionOrder calls made with this
 * transaction client. Call AFTER `prisma.$transaction` resolves (i.e. after
 * commit). No-op when nothing was collected.
 */
export function flushOrderEvents(tx: object): void {
  const pending = pendingByTx.get(tx);
  if (!pending || pending.length === 0) return;
  pendingByTx.delete(tx);
  for (const event of pending) {
    publishOrderEvent(event.tenantId, event.type, event.payload);
  }
}

// ─── Guarded transition ────────────────────────────────────────────────────

export interface TransitionArgs {
  orderId: string;
  tenantId: string;
  from: DeliveryOrderStatus;
  to: DeliveryOrderStatus;
  actor: OrderActor;
  /** Extra columns to set atomically with the status change
   *  (driverId, timestamps, cancelReason, codCollectedKwd, ...). The
   *  Unchecked variant is included so relation FK scalars (driverId,
   *  pickupZoneId, dropoffZoneId) can be set — plain
   *  DeliveryOrderUpdateManyMutationInput values remain assignable. */
  data?:
    | Prisma.DeliveryOrderUpdateManyMutationInput
    | Prisma.DeliveryOrderUncheckedUpdateManyInput;
  /** Merged into the OrderEvent metadata AND the collected SSE payload.
   *  Pass orderNumber / vendorId / driverId / feeKwd here so the §A7
   *  payload contract is satisfied. */
  eventMeta?: Record<string, unknown>;
}

function actionForStatus(to: DeliveryOrderStatus): string {
  return `order.${to.toLowerCase()}`;
}

function describeTransition(
  from: DeliveryOrderStatus,
  to: DeliveryOrderStatus,
  actor: OrderActor,
  meta?: Record<string, unknown>,
): string {
  const by = actor.name ?? actor.type;
  switch (to) {
    case "DISPATCHING":
      return from === "NO_DRIVER"
        ? `Order re-entered dispatch (by ${by})`
        : `Order entered dispatch`;
    case "ASSIGNED":
      return `Order assigned to driver (by ${by})`;
    case "ARRIVED":
      return `Courier arrived at the shop`;
    case "PICKED_UP":
      return `Courier picked up the order`;
    case "DELIVERED":
      return `Order delivered`;
    case "FAILED":
      return `Delivery failed (reported by ${by})`;
    case "CANCELLED":
      return `Order cancelled (by ${by})`;
    case "NO_DRIVER":
      // "No driver accepted" reads as "couriers are turning this down", which
      // sends ops looking for a dispatch fault. Most of the time the truth is
      // that nobody was on shift to be asked, and that is a rota problem, not
      // a dispatch one. The engine already knows which it was; say it.
      switch (meta?.reason) {
        case "NO_COURIERS_ONLINE":
          return `No couriers online — nobody to offer this to`;
        case "NO_CANDIDATES":
          return `No courier available in range`;
        case "MAX_ROUNDS":
          return `Dispatch exhausted — no driver accepted`;
        default:
          return `Dispatch exhausted — no driver found`;
      }
    case "REJECTED":
      return `Order rejected`;
    case "CREATED":
      return `Order re-entered pipeline after dropoff fix (by ${by})`;
    case "RETURNED":
      return `Return to merchant authorised (by ${by})`;
    default:
      return `Order moved ${from} → ${to}`;
  }
}

/**
 * Perform one guarded FSM transition inside the caller's transaction:
 *
 *   1. Legality check against ALLOWED (illegal pair ⇒ OrderStateConflictError
 *      without touching the DB).
 *   2. Status-guarded updateMany({ id, tenantId, status: from }) — count===0
 *      ⇒ OrderStateConflictError (someone else won the race).
 *   3. OrderEvent append (action "order.<to>", operator = actor.name).
 *   4. Collect the §A7 SSE event for post-commit flushOrderEvents(tx).
 */
export async function transitionOrder(
  tx: Prisma.TransactionClient,
  args: TransitionArgs,
): Promise<void> {
  const { orderId, tenantId, from, to, actor, data, eventMeta } = args;

  if (!isTransitionAllowed(from, to)) {
    throw new OrderStateConflictError(orderId, from, to);
  }

  const result = await tx.deliveryOrder.updateMany({
    where: { id: orderId, tenantId, status: from },
    data: { ...(data ?? {}), status: to },
  });
  if (result.count === 0) {
    throw new OrderStateConflictError(orderId, from, to);
  }

  await tx.orderEvent.create({
    data: {
      tenantId,
      orderId,
      action: actionForStatus(to),
      description: describeTransition(from, to, actor, eventMeta),
      operator: actor.name ?? actor.type,
      operatorId: actor.id ?? null,
      timestamp: new Date(),
      metadata: {
        from,
        to,
        actorType: actor.type,
        ...(eventMeta ?? {}),
      } as Prisma.InputJsonValue,
    },
  });

  const sseType = SSE_TYPE_FOR_STATUS[to];
  if (sseType) {
    const pending = pendingByTx.get(tx) ?? [];
    pending.push({
      tenantId,
      type: sseType,
      payload: { orderId, status: to, ...(eventMeta ?? {}) },
    });
    pendingByTx.set(tx, pending);
  }
}
