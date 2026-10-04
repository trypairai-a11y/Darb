/**
 * Revision 20 — driver training.
 *
 * Client note, 2026-09-15: "the driver that in training sessions he will get
 * fake orders to be delivered and the ops team will monitor the driver, also
 * they can adjust the training period here as an example 1/2/3 days then it
 * will show his performance, after finishing the sessions the ops team will
 * activate the driver account".
 *
 * Two decisions shape everything below.
 *
 * FIRST: a practice order is a REAL `DeliveryOrder` carrying `isTraining`.
 * It gets an order number, a POD PIN, a tracking token, a proof photo and the
 * same FSM as a paying customer's. A mocked-up flow would have taught the
 * driver the mock; worse, it would have needed a second code path through the
 * app, and the first time the two drifted a trainee would pass on a screen
 * that no longer exists. What is fake is the customer and the money, and the
 * flag is what keeps the money out: settlement, the merchant's board, the
 * vendor statement and the delivery company's payout count all filter on it.
 *
 * SECOND: a practice order is ASSIGNED DIRECTLY, never dispatched. Ops is
 * training one named person, so an offer round that somebody else could win is
 * not merely wasteful, it is wrong. `Driver.inTraining` keeps the trainee out
 * of the real candidate pool for the same reason, and it is a separate flag
 * from `isFrozen` because freezing would have stopped the training too.
 */
import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";
import {
  generateTrackingToken,
  nextOrderNumber,
} from "../orderService";
import { transitionOrder, flushOrderEvents, SYSTEM_ACTOR, type OrderActor } from "../orderStateMachine";
import { randomInt } from "crypto";

/** The client named one, two and three days; 14 is the outer sanity bound. */
export const MIN_PERIOD_DAYS = 1;
export const MAX_PERIOD_DAYS = 14;

function endOfWindow(startsAt: Date, periodDays: number): Date {
  return new Date(startsAt.getTime() + periodDays * 86_400_000);
}

function podPin(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

// ─── Sessions ───────────────────────────────────────────────────────────────

/**
 * Open a training window for a driver.
 *
 * Refuses a second live window for the same driver: two overlapping windows
 * would both claim the same practice orders and the scorecard behind each
 * would be a different answer to the same question.
 */
export async function createTrainingSession(params: {
  tenantId: string;
  driverId: string;
  periodDays: number;
  startsAt?: Date;
  reason?: string | null;
  coachId?: string | null;
}) {
  const { tenantId, driverId } = params;
  const periodDays = Math.trunc(params.periodDays);
  if (!Number.isFinite(periodDays) || periodDays < MIN_PERIOD_DAYS || periodDays > MAX_PERIOD_DAYS) {
    throw Object.assign(
      new Error(`Training period must be between ${MIN_PERIOD_DAYS} and ${MAX_PERIOD_DAYS} days`),
      { statusCode: 400 },
    );
  }

  const driver = await prisma.driver.findFirst({
    where: { id: driverId, tenantId },
    select: { id: true, name: true, status: true },
  });
  if (!driver) throw Object.assign(new Error("Driver not found"), { statusCode: 404 });

  const live = await prisma.driverTrainingSession.findFirst({
    where: { tenantId, driverId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
    select: { id: true },
  });
  if (live) {
    throw Object.assign(new Error("That driver already has an open training window"), {
      statusCode: 409,
    });
  }

  const startsAt = params.startsAt ?? new Date();
  const started = startsAt.getTime() <= Date.now();

  return prisma.$transaction(async (tx) => {
    const session = await tx.driverTrainingSession.create({
      data: {
        tenantId,
        driverId,
        periodDays,
        startsAt,
        endsAt: endOfWindow(startsAt, periodDays),
        status: started ? "IN_PROGRESS" : "SCHEDULED",
        ...(started ? { startedAt: new Date() } : {}),
        reason: params.reason ?? null,
        coachId: params.coachId ?? null,
      },
    });
    // The flag goes on the moment the window is booked, not when it starts:
    // a driver scheduled for training tomorrow must not win a real order
    // tonight and be mid-delivery when the coach arrives.
    await tx.driver.update({ where: { id: driverId }, data: { inTraining: true } });
    return session;
  }).then(async (session) => {
    // Revision 21 (#3): a window that starts now gets its first practice order
    // now. Best effort, outside the transaction: a branch table with no
    // coordinates must not stop the window from opening.
    if (started) await autoIssuePracticeOrder(tenantId, session.id).catch(() => null);
    return session;
  });
}

/**
 * Change the period mid-window, which is exactly what the client asked for.
 * `endsAt` is always startsAt + periodDays, so shortening a window that has
 * already run past its new end closes it immediately on the next read rather
 * than leaving a session whose dates disagree with its number.
 */
export async function adjustTrainingPeriod(params: {
  tenantId: string;
  sessionId: string;
  periodDays: number;
}) {
  const periodDays = Math.trunc(params.periodDays);
  if (!Number.isFinite(periodDays) || periodDays < MIN_PERIOD_DAYS || periodDays > MAX_PERIOD_DAYS) {
    throw Object.assign(
      new Error(`Training period must be between ${MIN_PERIOD_DAYS} and ${MAX_PERIOD_DAYS} days`),
      { statusCode: 400 },
    );
  }
  const session = await prisma.driverTrainingSession.findFirst({
    where: { id: params.sessionId, tenantId: params.tenantId },
    select: { id: true, startsAt: true, status: true },
  });
  if (!session) throw Object.assign(new Error("Training session not found"), { statusCode: 404 });
  if (session.status === "PASSED" || session.status === "FAILED" || session.status === "CANCELLED") {
    throw Object.assign(new Error("That training window has already closed"), { statusCode: 409 });
  }
  return prisma.driverTrainingSession.update({
    where: { id: session.id },
    data: { periodDays, endsAt: endOfWindow(session.startsAt, periodDays) },
  });
}

/** Start a SCHEDULED window now. */
export async function startTrainingSession(tenantId: string, sessionId: string) {
  const claimed = await prisma.driverTrainingSession.updateMany({
    where: { id: sessionId, tenantId, status: "SCHEDULED" },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw Object.assign(new Error("Training session is not scheduled"), { statusCode: 409 });
  }
  await autoIssuePracticeOrder(tenantId, sessionId).catch(() => null);
  return prisma.driverTrainingSession.findFirst({ where: { id: sessionId, tenantId } });
}

/**
 * Revision 21 (#3) — "orders should be sent automatically, with the option
 * to send manual orders, keep the driver busy".
 *
 * The switch is per window, on by default. Turning it off stops the next
 * order; it never recalls one already handed to the driver.
 */
export async function setTrainingAutoIssue(params: {
  tenantId: string;
  sessionId: string;
  enabled: boolean;
}) {
  const session = await prisma.driverTrainingSession.findFirst({
    where: { id: params.sessionId, tenantId: params.tenantId },
    select: { id: true, status: true },
  });
  if (!session) throw Object.assign(new Error("Training session not found"), { statusCode: 404 });
  if (session.status === "PASSED" || session.status === "FAILED" || session.status === "CANCELLED") {
    throw Object.assign(new Error("That training window has already closed"), { statusCode: 409 });
  }
  const updated = await prisma.driverTrainingSession.update({
    where: { id: session.id },
    data: { autoIssue: params.enabled },
  });
  if (params.enabled) await autoIssuePracticeOrder(params.tenantId, session.id).catch(() => null);
  return updated;
}

// ─── Practice orders ────────────────────────────────────────────────────────

export interface PracticeOrderInput {
  tenantId: string;
  sessionId: string;
  /** The branch the trainee collects from. A real one: the address is the point. */
  branchId: string;
  dropoffAddress?: string | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
  /** Minutes the trainee is given. Defaults to the same 45 a live order gets. */
  slaMinutes?: number;
  actor?: OrderActor;
}

/**
 * Hand the trainee one practice order.
 *
 * Order numbers use the reserved `TRN` code rather than the merchant's own, so
 * a practice run never consumes a number out of a real shop's sequence and
 * nobody reading a list has to work out which "DRB-BRGB-000412" was real.
 */
export async function issuePracticeOrder(input: PracticeOrderInput) {
  const { tenantId, sessionId } = input;

  const session = await prisma.driverTrainingSession.findFirst({
    where: { id: sessionId, tenantId },
    select: { id: true, driverId: true, status: true, driver: { select: { id: true, name: true } } },
  });
  if (!session) throw Object.assign(new Error("Training session not found"), { statusCode: 404 });
  if (session.status !== "IN_PROGRESS") {
    throw Object.assign(new Error("Training session is not running"), { statusCode: 409 });
  }

  const branch = await prisma.vendorBranch.findFirst({
    where: { id: input.branchId, tenantId },
    select: { id: true, vendorId: true, name: true, lat: true, lng: true, zoneId: true },
  });
  if (!branch) throw Object.assign(new Error("Branch not found"), { statusCode: 404 });

  const actor: OrderActor = input.actor ?? SYSTEM_ACTOR;
  const slaMinutes = input.slaMinutes ?? 45;

  const { tx, order } = await prisma.$transaction(async (trx) => {
    const orderNumber = await nextOrderNumber(trx, tenantId, "TRN");
    const created = await trx.deliveryOrder.create({
      data: {
        tenantId,
        orderNumber,
        source: "SUPERVISOR",
        vendorId: branch.vendorId,
        branchId: branch.id,
        status: "CREATED",
        // PREPAID, always. A trainee must not be handed real cash to collect,
        // and a COD practice order would post a driver-cash leg the moment
        // anybody removed the isTraining guard from settlement.
        paymentMethod: "PREPAID",
        orderTotalKwd: new Prisma.Decimal(0),
        deliveryFeeKwd: new Prisma.Decimal(0),
        customerName: input.customerName ?? "Training customer",
        customerPhone: input.customerPhone ?? null,
        dropoffAddress: input.dropoffAddress ?? null,
        ...(input.dropoffLat != null ? { dropoffLat: new Prisma.Decimal(input.dropoffLat) } : {}),
        ...(input.dropoffLng != null ? { dropoffLng: new Prisma.Decimal(input.dropoffLng) } : {}),
        pickupZoneId: branch.zoneId ?? null,
        podPin: podPin(),
        trackingToken: generateTrackingToken(),
        slaDeadline: new Date(Date.now() + slaMinutes * 60_000),
        isTraining: true,
        trainingSessionId: sessionId,
      },
    });

    // CREATED → DISPATCHING → ASSIGNED, through the real machine. The middle
    // step is not ceremony: the FSM's own guards, the OrderEvent trail and the
    // SSE stream all key off these transitions, and skipping to ASSIGNED would
    // produce an order the live board cannot explain.
    await transitionOrder(trx, {
      orderId: created.id,
      tenantId,
      from: "CREATED",
      to: "DISPATCHING",
      actor,
      eventMeta: { orderNumber, training: true },
    });
    await transitionOrder(trx, {
      orderId: created.id,
      tenantId,
      from: "DISPATCHING",
      to: "ASSIGNED",
      actor,
      data: { driverId: session.driverId, assignedAt: new Date(), offerRound: 1 },
      eventMeta: {
        orderNumber,
        training: true,
        driverId: session.driverId,
        note: "Practice order assigned directly to the trainee",
      },
    });

    const row = await trx.deliveryOrder.findFirstOrThrow({ where: { id: created.id, tenantId } });
    return { tx: trx, order: row };
  });

  flushOrderEvents(tx);
  return order;
}

// ─── Keeping the trainee busy ───────────────────────────────────────────────

/** A practice order the trainee has not finished with yet. */
const IN_FLIGHT: string[] = ["CREATED", "DISPATCHING", "ASSIGNED", "ARRIVED", "PICKED_UP"];

/**
 * The most a window hands out in one day, and the least time between two.
 *
 * Both are brakes on a loop, not a training policy: a trainee whose app fails
 * every order the second it lands would otherwise be given a new one the same
 * second, for as long as the window is open. Sixty a day is more than anybody
 * delivers; a minute apart is shorter than any real pickup.
 */
export const AUTO_ISSUE_DAILY_CAP = 60;
export const AUTO_ISSUE_MIN_GAP_MS = 60_000;

/**
 * Hand the trainee the next practice order if they have nothing in hand.
 *
 * Called when a practice order ends (delivered, failed, cancelled), when a
 * window starts, and from the minute sweep as a backstop. Every call is
 * idempotent on the state it reads: with an order in flight it does nothing,
 * so three callers racing produce one order, not three. Returns the order it
 * issued, or null with the reason it did not.
 *
 * Pickup is one of the network's real branches, dropoff is another real
 * branch's address, because the whole point (revision 20) is that the trainee
 * drives a route the map can navigate. Same area as the trainee's when one
 * is assigned, any area otherwise.
 */
export async function autoIssuePracticeOrder(
  tenantId: string,
  sessionId: string,
  now = new Date(),
): Promise<{ issued: Awaited<ReturnType<typeof issuePracticeOrder>> | null; reason: string | null }> {
  const session = await prisma.driverTrainingSession.findFirst({
    where: { id: sessionId, tenantId },
    select: {
      id: true,
      status: true,
      autoIssue: true,
      endsAt: true,
      driver: { select: { id: true, assignedZoneId: true } },
    },
  });
  if (!session) return { issued: null, reason: "NOT_FOUND" };
  if (session.status !== "IN_PROGRESS") return { issued: null, reason: "NOT_RUNNING" };
  if (!session.autoIssue) return { issued: null, reason: "AUTO_OFF" };
  if (session.endsAt.getTime() <= now.getTime()) return { issued: null, reason: "WINDOW_OVER" };

  const [inFlight, today, last] = await Promise.all([
    prisma.deliveryOrder.count({
      where: { tenantId, trainingSessionId: sessionId, status: { in: IN_FLIGHT as never } },
    }),
    prisma.deliveryOrder.count({
      where: {
        tenantId,
        trainingSessionId: sessionId,
        createdAt: { gte: new Date(now.getTime() - 86_400_000) },
      },
    }),
    prisma.deliveryOrder.findFirst({
      where: { tenantId, trainingSessionId: sessionId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, branchId: true },
    }),
  ]);
  if (inFlight > 0) return { issued: null, reason: "IN_FLIGHT" };
  if (today >= AUTO_ISSUE_DAILY_CAP) return { issued: null, reason: "DAILY_CAP" };
  if (last && now.getTime() - last.createdAt.getTime() < AUTO_ISSUE_MIN_GAP_MS) {
    return { issued: null, reason: "TOO_SOON" };
  }

  const branches = await prisma.vendorBranch.findMany({
    where: { tenantId, isActive: true, lat: { not: null }, lng: { not: null } },
    select: { id: true, address: true, lat: true, lng: true, zoneId: true, name: true },
    take: 500,
  });
  if (branches.length === 0) return { issued: null, reason: "NO_PICKUP_POINTS" };

  const zoneId = session.driver.assignedZoneId;
  const inZone = zoneId ? branches.filter((b) => b.zoneId === zoneId) : [];
  const pool = inZone.length ? inZone : branches;
  // Not the branch they just collected from, when there is a choice: the same
  // counter twice in a row teaches one route.
  const pickupPool = pool.length > 1 && last ? pool.filter((b) => b.id !== last.branchId) : pool;
  const pickup = pickupPool[randomInt(0, pickupPool.length)]!;
  const dropPool = branches.filter((b) => b.id !== pickup.id);
  const drop = dropPool.length ? dropPool[randomInt(0, dropPool.length)]! : null;

  const issued = await issuePracticeOrder({
    tenantId,
    sessionId,
    branchId: pickup.id,
    dropoffAddress: drop ? (drop.address ?? drop.name) : (pickup.address ?? pickup.name),
    dropoffLat: drop?.lat != null ? Number(drop.lat) : null,
    dropoffLng: drop?.lng != null ? Number(drop.lng) : null,
    customerName: "Training customer",
    actor: SYSTEM_ACTOR,
  });
  return { issued, reason: null };
}

/**
 * The minute sweep's backstop across every running window with the switch
 * on. The event-driven call (an order ending) is what normally issues the
 * next one; this catches a window whose last order was cancelled from the
 * board, or a server that restarted between the two.
 */
export async function sweepTrainingAutoIssue(now = new Date()): Promise<{ issued: number; checked: number }> {
  // Cross-tenant on purpose: a cron sweep, not a request. Every session found
  // here is re-read under its own tenantId before anything is written.
  // eslint-disable-next-line no-prisma-without-tenant -- cron-internal: cross-tenant by design; autoIssuePracticeOrder re-reads each session under its own tenantId before writing
  const sessions = await prisma.driverTrainingSession.findMany({
    where: { status: "IN_PROGRESS", autoIssue: true, endsAt: { gt: now } },
    select: { id: true, tenantId: true },
    take: 200,
  });
  let issued = 0;
  for (const s of sessions) {
    try {
      const r = await autoIssuePracticeOrder(s.tenantId, s.id, now);
      if (r.issued) issued += 1;
    } catch {
      // One window's bad branch data must not stop the rest.
    }
  }
  return { issued, checked: sessions.length };
}

// ─── The scorecard ──────────────────────────────────────────────────────────

export interface TrainingScorecard {
  assigned: number;
  delivered: number;
  failed: number;
  cancelled: number;
  inFlight: number;
  /** Delivered inside the SLA, over delivered. Null with nothing delivered. */
  onTimeRate: number | null;
  /** Assigned to delivered, in minutes. Null with nothing delivered. */
  avgMinutes: number | null;
  /** Practice orders that took a proof photo or a PIN, over delivered. */
  podRate: number | null;
}

/** Compute the window's numbers from its practice orders. */
export async function trainingScorecard(
  tenantId: string,
  sessionId: string,
): Promise<TrainingScorecard> {
  const orders = await prisma.deliveryOrder.findMany({
    where: { tenantId, trainingSessionId: sessionId, isTraining: true },
    select: {
      status: true,
      assignedAt: true,
      deliveredAt: true,
      slaDeadline: true,
      proofPhotoUrl: true,
    },
  });

  const delivered = orders.filter((o) => o.status === "DELIVERED");
  const onTime = delivered.filter(
    (o) => o.slaDeadline && o.deliveredAt && o.deliveredAt <= o.slaDeadline,
  );
  const durations = delivered
    .filter((o) => o.assignedAt && o.deliveredAt)
    .map((o) => (o.deliveredAt!.getTime() - o.assignedAt!.getTime()) / 60_000);

  return {
    assigned: orders.length,
    delivered: delivered.length,
    failed: orders.filter((o) => o.status === "FAILED" || o.status === "RETURNED").length,
    cancelled: orders.filter((o) => o.status === "CANCELLED").length,
    inFlight: orders.filter((o) =>
      ["ASSIGNED", "ARRIVED", "PICKED_UP", "DISPATCHING", "CREATED"].includes(o.status),
    ).length,
    onTimeRate: delivered.length ? onTime.length / delivered.length : null,
    avgMinutes: durations.length
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
      : null,
    podRate: delivered.length
      ? delivered.filter((o) => o.proofPhotoUrl).length / delivered.length
      : null,
  };
}

// ─── Closing the window ─────────────────────────────────────────────────────

/**
 * Finish a window.
 *
 * PASSED is what the client means by "the ops team will activate the driver
 * account": it clears `inTraining` and sets the driver ACTIVE, which is the
 * one status dispatch will offer to. FAILED clears the flag too but leaves the
 * driver INACTIVE, because a trainee who is neither in training nor active is
 * a driver nobody is responsible for.
 *
 * The scorecard is SNAPSHOTTED here. Practice orders can still be cancelled or
 * reassigned afterwards, and a verdict that silently recomputed itself would
 * stop matching the numbers the coach actually saw.
 */
export async function completeTrainingSession(params: {
  tenantId: string;
  sessionId: string;
  outcome: "PASSED" | "FAILED";
  note?: string | null;
}) {
  const { tenantId, sessionId } = params;
  const scorecard = await trainingScorecard(tenantId, sessionId);

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.driverTrainingSession.updateMany({
      where: { id: sessionId, tenantId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      data: {
        status: params.outcome,
        completedAt: new Date(),
        outcomeNote: params.note ?? null,
        scorecard: scorecard as unknown as Prisma.InputJsonValue,
      },
    });
    if (claimed.count === 0) {
      throw Object.assign(new Error("That training window has already closed"), { statusCode: 409 });
    }
    const session = await tx.driverTrainingSession.findFirstOrThrow({
      where: { id: sessionId, tenantId },
    });
    await tx.driver.update({
      where: { id: session.driverId },
      data: {
        inTraining: false,
        ...(params.outcome === "PASSED" ? { status: "ACTIVE" } : { status: "INACTIVE" }),
      },
    });
    return { session, scorecard };
  });
}

/** Call the window off without passing judgement on the driver. */
export async function cancelTrainingSession(params: {
  tenantId: string;
  sessionId: string;
  note?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.driverTrainingSession.updateMany({
      where: { id: params.sessionId, tenantId: params.tenantId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      data: { status: "CANCELLED", completedAt: new Date(), outcomeNote: params.note ?? null },
    });
    if (claimed.count === 0) {
      throw Object.assign(new Error("That training window has already closed"), { statusCode: 409 });
    }
    const session = await tx.driverTrainingSession.findFirstOrThrow({
      where: { id: params.sessionId, tenantId: params.tenantId },
    });
    await tx.driver.update({ where: { id: session.driverId }, data: { inTraining: false } });
    return session;
  });
}

// ─── Reading ────────────────────────────────────────────────────────────────

/** The training tab's list, with each window's numbers computed live. */
export async function listTrainingSessions(params: {
  tenantId: string;
  status?: string;
  driverId?: string;
  take?: number;
}) {
  const sessions = await prisma.driverTrainingSession.findMany({
    where: {
      tenantId: params.tenantId,
      ...(params.status ? { status: params.status as never } : {}),
      ...(params.driverId ? { driverId: params.driverId } : {}),
    },
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    take: params.take ?? 100,
    select: {
      id: true,
      status: true,
      periodDays: true,
      startsAt: true,
      endsAt: true,
      startedAt: true,
      completedAt: true,
      reason: true,
      outcomeNote: true,
      autoIssue: true,
      scorecard: true,
      createdAt: true,
      driver: {
        select: {
          id: true,
          name: true,
          driverCode: true,
          phone: true,
          status: true,
          vehicleType: true,
          fleetPartner: { select: { id: true, name: true } },
        },
      },
      coach: { select: { id: true, name: true } },
    },
  });

  // A closed window reads its snapshot; a live one is computed, because the
  // whole point of the tab is watching the numbers move.
  const live = sessions.filter((s) => s.status === "SCHEDULED" || s.status === "IN_PROGRESS");
  const computed = new Map<string, TrainingScorecard>();
  for (const s of live) {
    computed.set(s.id, await trainingScorecard(params.tenantId, s.id));
  }

  return sessions.map((s) => ({
    ...s,
    scorecard: computed.get(s.id) ?? (s.scorecard as unknown as TrainingScorecard | null),
  }));
}

/** One window with its practice orders, for the detail panel. */
export async function trainingSessionDetail(tenantId: string, sessionId: string) {
  const session = await prisma.driverTrainingSession.findFirst({
    where: { id: sessionId, tenantId },
    select: {
      id: true,
      status: true,
      periodDays: true,
      startsAt: true,
      endsAt: true,
      startedAt: true,
      completedAt: true,
      reason: true,
      outcomeNote: true,
      autoIssue: true,
      scorecard: true,
      driver: {
        select: { id: true, name: true, driverCode: true, phone: true, status: true, inTraining: true },
      },
      coach: { select: { id: true, name: true } },
    },
  });
  if (!session) return null;

  const orders = await prisma.deliveryOrder.findMany({
    where: { tenantId, trainingSessionId: sessionId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      dropoffAddress: true,
      dropoffLat: true,
      dropoffLng: true,
      customerName: true,
      customerPhone: true,
      // The PIN is shown to the coach on purpose (revision 21b, "must show the
      // order details for each order"): on a practice order the coach IS the
      // customer, and the app asks for this at the door. Every row in this
      // query is a training order; a real order's PIN never leaves /api/track.
      podPin: true,
      assignedAt: true,
      arrivedAt: true,
      pickedUpAt: true,
      deliveredAt: true,
      slaDeadline: true,
      proofPhotoUrl: true,
      failureReason: true,
      createdAt: true,
      branch: { select: { id: true, name: true, address: true } },
      vendor: { select: { id: true, name: true } },
    },
  });

  const scorecard =
    session.status === "SCHEDULED" || session.status === "IN_PROGRESS"
      ? await trainingScorecard(tenantId, sessionId)
      : ((session.scorecard as unknown as TrainingScorecard | null) ?? null);

  return { ...session, scorecard, orders };
}

/**
 * Close windows whose end has passed with nothing decided.
 *
 * Run from the nightly cron. It does NOT pass or fail anybody — that is the
 * ops team's call and the client said so. What it does is clear `inTraining`,
 * so a driver whose coach went on leave is not left out of dispatch forever by
 * a window nobody closed.
 */
export async function sweepLapsedTrainingWindows(tenantId: string, now = new Date()) {
  const lapsed = await prisma.driverTrainingSession.findMany({
    // A day of grace: a window that ended this morning is still the coach's.
    where: { tenantId, status: { in: ["SCHEDULED", "IN_PROGRESS"] }, endsAt: { lt: new Date(now.getTime() - 86_400_000) } },
    select: { id: true, driverId: true },
  });
  for (const s of lapsed) {
    await prisma.driver.update({ where: { id: s.driverId }, data: { inTraining: false } });
  }
  return { released: lapsed.length };
}
