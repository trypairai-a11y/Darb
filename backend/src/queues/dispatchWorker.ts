/**
 * Darb 2.0 dispatch worker (plan §A3 topology).
 *
 * BullMQ Worker for the "dispatch" queue — routes the three job names to the
 * engine bodies:
 *   dispatch-start → startDispatch(tenantId, orderId)
 *   dispatch-next  → dispatchNext(tenantId, orderId)
 *   offer-expiry   → expireOffer(offerId)   (delayed job, jobId offer-expiry:{id})
 *
 * Boot: `startDispatchWorker()` from the server listen block (VERCEL !== "1")
 * or standalone via `npm run worker:dispatch` (require.main boot below —
 * mirrors notificationWorker/scheduledBriefingsWorker). Regardless of Redis,
 * starting the worker registers the in-process fallback handlers on
 * dispatchQueue (setOfferExpiryHandler / setDispatchJobHandler) so Redis-less
 * dev still runs the full offer lifecycle on setTimeout/setImmediate.
 */
import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  DISPATCH_QUEUE,
  DispatchJobData,
  setDispatchJobHandler,
  setOfferExpiryHandler,
} from "./dispatchQueue";
import {
  dispatchNext,
  expireOffer,
  startDispatch,
} from "../services/dispatch/dispatchEngine";

function hasRedis(): boolean {
  return !!env.REDIS_URL && env.REDIS_URL !== "redis://localhost:6379";
}

async function processJob(job: Job<DispatchJobData>): Promise<void> {
  const { orderId, tenantId, offerId } = job.data;
  switch (job.name) {
    case "dispatch-start":
      if (!orderId || !tenantId) throw new Error("dispatch-start requires orderId + tenantId");
      await startDispatch(tenantId, orderId);
      return;
    case "dispatch-next":
      if (!orderId || !tenantId) throw new Error("dispatch-next requires orderId + tenantId");
      await dispatchNext(tenantId, orderId);
      return;
    case "offer-expiry":
      if (!offerId) throw new Error("offer-expiry requires offerId");
      await expireOffer(offerId);
      return;
    default:
      logger.warn({ jobName: job.name, jobId: job.id }, "unknown dispatch job — skipped");
  }
}

let _workerSingleton: Worker<DispatchJobData> | null = null;

export function startDispatchWorker(): Worker<DispatchJobData> | null {
  // Always wire the Redis-less fallbacks — dispatchQueue degrades offer-expiry
  // to setTimeout and dispatch-start/next to setImmediate through these.
  // Wrapped, not passed by reference: expireOffer returns whether it won the
  // guarded update, and OfferExpiryHandler is `=> void | Promise<void>`.
  setOfferExpiryHandler(async (offerId) => {
    await expireOffer(offerId);
  });
  setDispatchJobHandler((name, data) =>
    name === "dispatch-start"
      ? startDispatch(data.tenantId, data.orderId)
      : dispatchNext(data.tenantId, data.orderId),
  );

  if (!hasRedis()) {
    logger.warn("dispatch worker: REDIS_URL not configured — in-process fallback handlers only");
    return null;
  }
  if (_workerSingleton) return _workerSingleton;

  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const worker = new Worker<DispatchJobData>(DISPATCH_QUEUE, processJob, {
    connection,
    concurrency: Number(process.env.DISPATCH_WORKER_CONCURRENCY || "5"),
  });

  worker.on("completed", (job) =>
    logger.debug({ jobId: job.id, jobName: job.name }, "dispatch job completed"),
  );
  worker.on("failed", (job, err) =>
    logger.warn({ jobId: job?.id, jobName: job?.name, err: err.message }, "dispatch job failed"),
  );
  worker.on("error", (err) => logger.error({ err }, "dispatch worker error"));

  logger.info("dispatch worker started");
  _workerSingleton = worker;
  return worker;
}

// Allow running `tsx src/queues/dispatchWorker.ts` as a standalone process
if (require.main === module) {
  startDispatchWorker();
}
