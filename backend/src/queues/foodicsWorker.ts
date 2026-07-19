/**
 * Darb 2.0 — Foodics queue + worker (plan §A6 + §A10).
 *
 * Queue "foodics", two job types:
 *
 *   foodics-ingest {webhookEventId}
 *     Load the WebhookEvent envelope → resolve connection/tenant/vendor →
 *     tag-eligibility filter (connection.orderTagId, pass-through when null)
 *     → `order.delivery.created`: mapper → orderService.createDeliveryOrder
 *       (idempotent via @@unique([tenantId, foodicsOrderId]) — P2002 ⇒ skip)
 *     → `order.delivery.updated`: POS-side cancel ⇒ cancelOrder pre-PICKED_UP,
 *       supervisor Notification otherwise.
 *     WebhookEvent marked PROCESSED / FAILED; skips are recorded as
 *     PROCESSED with error "SKIPPED: <reason>" (the WebhookEventStatus enum
 *     has no SKIPPED value — deliberate reuse of the error column as a note).
 *
 *   foodics-writeback {orderId, milestone}
 *     statusWriteback.writeBackMilestone — attempts 5, exponential backoff
 *     (mirrors enqueueNotification's options); terminal failure ⇒
 *     recordWritebackFailure (OrderEvent + supervisor Notification).
 *
 * Topology (mirrors walletReconciliationWorker): singleton queue/connection/
 * worker accessors behind hasRedis(); startFoodicsWorker() is called from the
 * server listen block (integration item — NOT wired here) or standalone via
 * `npm run worker:foodics` (require.main boot). WITHOUT Redis both enqueue
 * helpers fall back to in-process execution (setImmediate) so local dev
 * works end-to-end.
 */
import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { Prisma } from "../generated/prisma";
import { prisma } from "../config";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { cancelOrder, createDeliveryOrder } from "../services/orderService";
import { FoodicsWritebackMilestone } from "../services/foodics/writebackHook";
import {
  recordWritebackFailure,
  writeBackMilestone,
} from "../services/foodics/statusWriteback";
import {
  extractFoodicsEnvelope,
  isFoodicsOrderInactive,
  isSkip,
  mapFoodicsOrder,
  orderHasTag,
} from "../services/foodics/mapper";

export const FOODICS_QUEUE = "foodics";

export type FoodicsJobName = "foodics-ingest" | "foodics-writeback";

export interface FoodicsIngestJobData {
  webhookEventId: string;
}

export interface FoodicsWritebackJobData {
  orderId: string;
  milestone: FoodicsWritebackMilestone;
}

type FoodicsJobData = FoodicsIngestJobData | FoodicsWritebackJobData;

/** Statuses where a POS-side cancel still cancels our order (pre-PICKED_UP). */
const PRE_PICKUP_STATUSES = ["CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED"] as const;
const TERMINAL_STATUSES = new Set(["DELIVERED", "FAILED", "CANCELLED", "REJECTED"]);

// Mirrors enqueueNotification's job options (notificationQueue.ts).
const WRITEBACK_JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

const INGEST_JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

// ─── Queue + connection singletons ─────────────────────────────────────────

function hasRedis(): boolean {
  return !!env.REDIS_URL && env.REDIS_URL !== "redis://localhost:6379";
}

let _queueSingleton: Queue<FoodicsJobData> | null = null;
let _connectionSingleton: IORedis | null = null;

function getConnection(): IORedis | null {
  if (!hasRedis()) return null;
  if (_connectionSingleton) return _connectionSingleton;
  _connectionSingleton = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return _connectionSingleton;
}

export function getFoodicsQueue(): Queue<FoodicsJobData> | null {
  if (!hasRedis()) return null;
  if (_queueSingleton) return _queueSingleton;
  const connection = getConnection();
  if (!connection) return null;
  _queueSingleton = new Queue<FoodicsJobData>(FOODICS_QUEUE, { connection });
  logger.info({ queue: FOODICS_QUEUE }, "foodics queue ready");
  return _queueSingleton;
}

// ─── Enqueue helpers (with in-process fallback) ────────────────────────────

/**
 * Enqueue ingest for one WebhookEvent. jobId keyed by the event id so a
 * webhook retry that somehow re-enqueues coalesces into one job. Without
 * Redis, processes inline on the next tick.
 */
export async function enqueueFoodicsIngest(webhookEventId: string): Promise<"queued" | "inline"> {
  const q = getFoodicsQueue();
  if (q) {
    await q.add(
      "foodics-ingest",
      { webhookEventId },
      { ...INGEST_JOB_OPTS, jobId: `foodics-ingest:${webhookEventId}` },
    );
    return "queued";
  }
  setImmediate(() => {
    processFoodicsIngest(webhookEventId).catch((err) =>
      logger.error({ err, webhookEventId }, "foodics: inline ingest failed"),
    );
  });
  return "inline";
}

/**
 * Enqueue a milestone write-back. Without Redis, runs inline (single
 * attempt; terminal-failure handling still applies).
 */
export async function enqueueFoodicsWritebackJob(
  orderId: string,
  milestone: FoodicsWritebackMilestone,
): Promise<"queued" | "inline"> {
  const q = getFoodicsQueue();
  if (q) {
    await q.add("foodics-writeback", { orderId, milestone }, WRITEBACK_JOB_OPTS);
    return "queued";
  }
  setImmediate(() => {
    processFoodicsWriteback({ orderId, milestone }).catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err, orderId, milestone }, "foodics: inline writeback failed (no retries without Redis)");
      await recordWritebackFailure(orderId, milestone, message);
    });
  });
  return "inline";
}

// ─── Ingest processor (exported for tests + inline fallback) ───────────────

interface WebhookEnvelopeStored {
  connectionId?: string;
  tenantId?: string;
  vendorId?: string;
  body?: unknown;
}

async function markWebhookEvent(
  id: string,
  status: "PROCESSED" | "FAILED",
  note?: string | null,
): Promise<void> {
  try {
    await prisma.webhookEvent.update({
      where: { id },
      data: { status, error: note ?? null, processedAt: new Date() },
    });
  } catch (err) {
    logger.error({ err, webhookEventId: id }, "foodics: failed to mark WebhookEvent");
  }
}

export interface IngestOutcome {
  outcome: "processed" | "skipped" | "duplicate";
  note?: string;
  orderId?: string;
}

/**
 * Process one stored WebhookEvent. Throws on infrastructure errors (BullMQ
 * retries); business-rule dead-ends are recorded as skips, not failures.
 */
export async function processFoodicsIngest(webhookEventId: string): Promise<IngestOutcome> {
  const event = await prisma.webhookEvent.findUnique({ where: { id: webhookEventId } });
  if (!event) return { outcome: "skipped", note: "webhook event row missing" };
  if (event.status === "PROCESSED") {
    return { outcome: "skipped", note: "already processed" };
  }

  const skip = async (note: string): Promise<IngestOutcome> => {
    await markWebhookEvent(webhookEventId, "PROCESSED", `SKIPPED: ${note}`);
    return { outcome: "skipped", note };
  };

  try {
    const stored = (event.payload ?? {}) as WebhookEnvelopeStored;
    if (!stored.connectionId || !stored.tenantId || !stored.vendorId) {
      return await skip("payload envelope missing connection identity");
    }
    const { tenantId, vendorId } = stored;

    const connection = await prisma.foodicsConnection.findFirst({
      where: { id: stored.connectionId, tenantId },
    });
    if (!connection) return await skip("connection no longer exists");
    if (connection.status !== "CONNECTED") {
      return await skip(`connection status ${connection.status}`);
    }

    const { event: eventName, order } = extractFoodicsEnvelope(stored.body);
    if (!order) return await skip("no order object in webhook body");

    // Eligibility: when an order tag is configured, only tagged orders are
    // ours to fulfil. Null orderTagId ⇒ pass-through (ingest everything).
    if (connection.orderTagId && !orderHasTag(order, connection.orderTagId)) {
      return await skip(`order not tagged with ${connection.orderTagId}`);
    }

    if (eventName === "order.delivery.created") {
      const branches = await prisma.vendorBranch.findMany({
        where: { tenantId, vendorId, foodicsBranchId: { not: null } },
        select: { id: true, foodicsBranchId: true },
      });
      const branchByFoodicsId = new Map(
        branches.map((b) => [b.foodicsBranchId as string, { id: b.id }]),
      );

      const mapped = mapFoodicsOrder(order, { tenantId, vendorId, branchByFoodicsId });
      if (isSkip(mapped)) return await skip(mapped.skip);

      try {
        const created = await createDeliveryOrder(mapped);
        await markWebhookEvent(webhookEventId, "PROCESSED", null);
        return { outcome: "processed", orderId: created.id };
      } catch (err) {
        if ((err as { code?: string })?.code === "P2002") {
          // @@unique([tenantId, foodicsOrderId]) — replayed webhook.
          await markWebhookEvent(webhookEventId, "PROCESSED", "SKIPPED: duplicate foodicsOrderId");
          return { outcome: "duplicate" };
        }
        throw err;
      }
    }

    if (eventName === "order.delivery.updated") {
      if (!isFoodicsOrderInactive(order)) {
        return await skip("update carries no actionable change");
      }
      const foodicsOrderId =
        typeof order.id === "string" || typeof order.id === "number" ? String(order.id) : null;
      if (!foodicsOrderId) return await skip("update without order id");

      const ours = await prisma.deliveryOrder.findFirst({
        where: { tenantId, foodicsOrderId },
      });
      if (!ours) return await skip("no matching delivery order");
      if (TERMINAL_STATUSES.has(ours.status)) {
        return await skip(`order already ${ours.status}`);
      }

      if ((PRE_PICKUP_STATUSES as readonly string[]).includes(ours.status)) {
        await cancelOrder({
          tenantId,
          orderId: ours.id,
          reason: "FOODICS_POS_CANCELLED",
          actor: { type: "SYSTEM", name: "foodics-webhook" },
          allowFrom: [...PRE_PICKUP_STATUSES],
        });
        await markWebhookEvent(webhookEventId, "PROCESSED", null);
        return { outcome: "processed", orderId: ours.id };
      }

      // Picked up already — food is on the road; a human must decide.
      await notifyPosCancelledAfterPickup(tenantId, ours.id, ours.orderNumber);
      await markWebhookEvent(webhookEventId, "PROCESSED", "notified: POS cancel after pickup");
      return { outcome: "processed", orderId: ours.id };
    }

    return await skip(`unhandled event ${eventName ?? "(none)"}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markWebhookEvent(webhookEventId, "FAILED", message);
    throw err; // let BullMQ retry; a later success overwrites to PROCESSED
  }
}

/** Supervisor heads-up when the POS cancels an order we already picked up. */
async function notifyPosCancelledAfterPickup(
  tenantId: string,
  orderId: string,
  orderNumber: string,
): Promise<void> {
  const supervisors = await prisma.user.findMany({
    where: { tenantId, role: { in: ["ADMIN", "OPS_MANAGER", "SUPERVISOR"] }, isActive: true },
    select: { id: true },
  });
  if (supervisors.length === 0) return;
  await prisma.notification.createMany({
    data: supervisors.map((user) => ({
      tenantId,
      userId: user.id,
      title: "Foodics cancelled an order already picked up",
      message: `Order ${orderNumber} was cancelled on the Foodics POS after our courier collected it. Contact the courier and resolve manually.`,
      type: "FOODICS_POS_CANCELLED_AFTER_PICKUP",
      severity: "HIGH",
      sourceId: orderId,
      metadata: { orderId, orderNumber } as unknown as Prisma.InputJsonValue,
    })),
  });
}

// ─── Writeback processor ───────────────────────────────────────────────────

/**
 * One write-back attempt. Skips resolve quietly; API errors THROW so BullMQ
 * retries (terminal failure handled by the worker's `failed` listener).
 */
export async function processFoodicsWriteback(data: FoodicsWritebackJobData): Promise<void> {
  const result = await writeBackMilestone(data.orderId, data.milestone);
  if ("skipped" in result) {
    logger.debug(
      { orderId: data.orderId, milestone: data.milestone, reason: result.skipped },
      "foodics: writeback skipped",
    );
  }
}

// ─── BullMQ worker ─────────────────────────────────────────────────────────

let _workerSingleton: Worker<FoodicsJobData> | null = null;

export function startFoodicsWorker(): Worker<FoodicsJobData> | null {
  if (!hasRedis()) {
    logger.warn("startFoodicsWorker: REDIS_URL not configured; worker disabled (enqueue helpers fall back to inline processing)");
    return null;
  }
  if (_workerSingleton) return _workerSingleton;
  const connection = getConnection();
  if (!connection) return null;

  const worker = new Worker<FoodicsJobData>(
    FOODICS_QUEUE,
    async (job: Job<FoodicsJobData>) => {
      if (job.name === "foodics-ingest") {
        return await processFoodicsIngest((job.data as FoodicsIngestJobData).webhookEventId);
      }
      if (job.name === "foodics-writeback") {
        return await processFoodicsWriteback(job.data as FoodicsWritebackJobData);
      }
      logger.warn({ jobName: job.name }, "foodicsWorker: unknown job name");
      return null;
    },
    { connection, concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    logger.warn(
      { jobId: job?.id, jobName: job?.name, attemptsMade: job?.attemptsMade, err: err.message },
      "foodics job failed",
    );
    // Terminal write-back failure → OrderEvent + supervisor Notification.
    if (
      job &&
      job.name === "foodics-writeback" &&
      job.attemptsMade >= (job.opts.attempts ?? 1)
    ) {
      const data = job.data as FoodicsWritebackJobData;
      void recordWritebackFailure(data.orderId, data.milestone, err.message).catch(() => {});
    }
  });
  worker.on("error", (err) => logger.error({ err }, "foodicsWorker error"));

  logger.info("foodicsWorker started");
  _workerSingleton = worker;
  return worker;
}

// Allow `tsx src/queues/foodicsWorker.ts` standalone (npm run worker:foodics).
if (require.main === module) {
  startFoodicsWorker();
}
