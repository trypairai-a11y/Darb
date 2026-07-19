/**
 * Darb 2.0 dispatch queue ACCESSOR (plan §A3 topology).
 *
 * Queue accessor ONLY — the Worker lives in src/queues/dispatchWorker.ts
 * (dispatch-engine track) and is booted from the server listen block /
 * `worker:dispatch` npm script, never from this module.
 *
 * Mirrors src/queues/notificationQueue.ts: BullMQ gated on a real REDIS_URL
 * via hasRedis(); without Redis the offer-expiry timer degrades to an
 * in-process setTimeout that invokes the handler registered via
 * setOfferExpiryHandler() (the dispatch worker track registers the real
 * handler at boot). dispatch-start / dispatch-next degrade to an optional
 * in-process handler registered via setDispatchJobHandler() — when neither
 * Redis nor a handler is present the job is dropped with a warning (dev
 * without Redis and without the worker running in-process).
 */
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { logger } from "../config/logger";
import { env } from "../config/env";

export const DISPATCH_QUEUE = "dispatch";

export type DispatchJobName = "dispatch-start" | "dispatch-next" | "offer-expiry";

export type DispatchJobData = {
  orderId?: string;
  tenantId?: string;
  offerId?: string;
};

let queue: Queue<DispatchJobData> | null = null;

function hasRedis(): boolean {
  return !!env.REDIS_URL && env.REDIS_URL !== "redis://localhost:6379";
}

export function getDispatchQueue(): Queue<DispatchJobData> | null {
  if (!hasRedis()) return null;
  if (queue) return queue;
  try {
    const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue<DispatchJobData>(DISPATCH_QUEUE, { connection });
    logger.info({ queue: DISPATCH_QUEUE }, "dispatch queue ready");
    return queue;
  } catch (e) {
    logger.error({ err: e }, "failed to init dispatch queue");
    return null;
  }
}

// ─── In-process fallbacks (dev without Redis) ──────────────────────────────

type OfferExpiryHandler = (offerId: string) => void | Promise<void>;
type DispatchJobHandler = (
  name: "dispatch-start" | "dispatch-next",
  data: { orderId: string; tenantId: string },
) => void | Promise<void>;

let offerExpiryHandler: OfferExpiryHandler | null = null;
let dispatchJobHandler: DispatchJobHandler | null = null;

/**
 * Register the offer-expiry handler used by the setTimeout fallback when
 * Redis is unavailable. The dispatch worker track registers the REAL handler
 * (mark OFFERED → EXPIRED, enqueue dispatch-next) at boot.
 */
export function setOfferExpiryHandler(fn: OfferExpiryHandler): void {
  offerExpiryHandler = fn;
}

/**
 * Optional in-process handler for dispatch-start / dispatch-next when Redis
 * is unavailable (same registration idea as setOfferExpiryHandler; the
 * dispatch worker may register its processor here for Redis-less dev).
 */
export function setDispatchJobHandler(fn: DispatchJobHandler): void {
  dispatchJobHandler = fn;
}

/** offerId → pending in-process expiry timer (fallback mode only). */
const localExpiryTimers = new Map<string, NodeJS.Timeout>();

const JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2_000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

async function enqueueDispatchJob(
  name: "dispatch-start" | "dispatch-next",
  orderId: string,
  tenantId: string,
): Promise<void> {
  const q = getDispatchQueue();
  if (q) {
    await q.add(name, { orderId, tenantId }, JOB_OPTS);
    return;
  }
  if (dispatchJobHandler) {
    const fn = dispatchJobHandler;
    setImmediate(() => {
      Promise.resolve(fn(name, { orderId, tenantId })).catch((err) =>
        logger.warn({ err, name, orderId }, "in-process dispatch handler failed"),
      );
    });
    return;
  }
  logger.warn(
    { name, orderId, tenantId },
    "dispatch queue unavailable and no in-process handler registered — job dropped",
  );
}

/** Kick off dispatch round 1 for a freshly created order. */
export async function enqueueDispatchStart(orderId: string, tenantId: string): Promise<void> {
  await enqueueDispatchJob("dispatch-start", orderId, tenantId);
}

/** Advance to the next offer round after a decline/expiry. */
export async function enqueueDispatchNext(orderId: string, tenantId: string): Promise<void> {
  await enqueueDispatchJob("dispatch-next", orderId, tenantId);
}

/**
 * Schedule the 15s offer-expiry timer. jobId `offer-expiry:{offerId}` makes
 * the BullMQ delayed job idempotent (double-adds coalesce). Without Redis, an
 * in-process setTimeout invokes the handler registered via
 * setOfferExpiryHandler.
 */
export async function scheduleOfferExpiry(offerId: string, delayMs: number): Promise<void> {
  const q = getDispatchQueue();
  if (q) {
    await q.add(
      "offer-expiry",
      { offerId },
      { ...JOB_OPTS, delay: delayMs, jobId: `offer-expiry:${offerId}` },
    );
    return;
  }

  if (localExpiryTimers.has(offerId)) return; // idempotent like the jobId path
  const timer = setTimeout(() => {
    localExpiryTimers.delete(offerId);
    if (!offerExpiryHandler) {
      logger.warn({ offerId }, "offer expired but no offer-expiry handler registered");
      return;
    }
    Promise.resolve(offerExpiryHandler(offerId)).catch((err) =>
      logger.warn({ err, offerId }, "in-process offer-expiry handler failed"),
    );
  }, delayMs);
  // Don't keep the process alive just for a pending offer timer.
  timer.unref?.();
  localExpiryTimers.set(offerId, timer);
}

/**
 * Best-effort removal of a pending offer-expiry job (offer accepted /
 * declined / withdrawn before the window elapsed). Never throws.
 */
export async function removeOfferExpiryJob(offerId: string): Promise<void> {
  const timer = localExpiryTimers.get(offerId);
  if (timer) {
    clearTimeout(timer);
    localExpiryTimers.delete(offerId);
  }
  const q = getDispatchQueue();
  if (!q) return;
  try {
    await q.remove(`offer-expiry:${offerId}`);
  } catch (err) {
    logger.debug?.({ err, offerId }, "removeOfferExpiryJob: nothing to remove");
  }
}
