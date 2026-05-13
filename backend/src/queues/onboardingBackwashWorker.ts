// Phase 2 Wave 4 — onboarding backwash worker.
//
// REQ-gtm-onboarding step 4: when a prospect signs up, pull their last 30
// days of operational data from each connected platform (Keeta / Talabat /
// Deliveroo / Americana). The wizard's Step 4 polls this worker via
// /api/admin/onboarding/tenants/:tid/backwash-status?jobId=X.
//
// Phase 2 SCAFFOLDING ONLY (per BLOCKER-2 path b). Real scraper invocation
// is deferred to Phase 6 (Ingest Adapter Layer). For Phase 2, the backwash
// runs end-to-end but the per-chunk side effect is swap-in-only:
//   - Production: a prior `seed-design-partner-fixture.ts` run pre-populates
//     OrderLog / Shift / CashRecord rows; the chunk iterator counts them
//     so the wizard's progress bar moves through realistic checkpoints.
//   - Phase 6: replace the `pullChunk` injection point with the real
//     ingest adapter (existing scraper pattern at
//     `backend/src/queues/keetaPortalScraperWorker.ts` for reference).
//
// Architecture:
//   - Queue name: ONBOARDING_BACKWASH_QUEUE = "onboarding:backwash"
//     (namespaced to avoid collision with the existing
//     keeta-portal / notification queues).
//   - 30-day window split into 6 chunks of 5 days each per platform.
//     totalSteps = 6 × N(platforms). Per-chunk job.updateProgress emits
//     {step, totalSteps, message}.
//   - Concurrency cap: ≤2 platforms in flight at once (Pitfall 5).
//     Implemented with an in-process semaphore, not BullMQ concurrency
//     (which is per-worker, not per-job-internal).
//
// Exports:
//   - runBackwashJob(args)  — pure, testable. Accepts injected pullChunk +
//     job for unit-test ergonomics. The Wave 0 onboardingBackwashWorker.test
//     calls this directly with fake injectables to assert chunk count,
//     progress events, and concurrency cap.
//   - getOnboardingBackwashQueue() — production queue accessor.
//   - getBackwashJob(jobId) — production status accessor for the route.
//   - startOnboardingBackwashWorker() — wires the queue to the BullMQ
//     worker (no-op when REDIS_URL is missing; real scraper landing in
//     Phase 6 will own the actual chunk fetching).

import { Worker, Queue, Job } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "../config";
import { env } from "../config/env";
import { logger } from "../config/logger";

// Phase 6 Wave 4: real backwash chunk handler. Re-exported below so existing
// callers can keep importing from this barrel (`onboardingBackwashWorker`)
// while the implementation lives in its own file for test ergonomics.
import { pullChunkPhase6 } from "./pullChunkPhase6";
export { pullChunkPhase6 } from "./pullChunkPhase6";

export const ONBOARDING_BACKWASH_QUEUE = "onboarding:backwash";

const CHUNK_DAYS = 5;
const CONCURRENCY = 2;

// ─── Types ─────────────────────────────────────────────────────────────────

export type BackwashPlatform = "KEETA" | "TALABAT" | "DELIVEROO" | "AMERICANA";

export interface BackwashJobData {
  tenantId: string;
  platforms: BackwashPlatform[];
  windowDays: number;
}

export interface BackwashChunkArgs {
  tenantId: string;
  platform: BackwashPlatform;
  from: string; // ISO date YYYY-MM-DD inclusive
  to: string; // ISO date YYYY-MM-DD exclusive
}

export type PullChunkFn = (args: BackwashChunkArgs) => Promise<unknown>;

export interface BackwashProgress {
  step: number;
  totalSteps: number;
  message: string;
}

export interface RunBackwashArgs {
  tenantId: string;
  platforms: BackwashPlatform[];
  windowDays: number;
  pullChunk: PullChunkFn;
  job: { updateProgress: (p: BackwashProgress) => Promise<void> | void };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function chunkWindows(windowDays: number): Array<{ from: Date; to: Date }> {
  const now = new Date();
  const windows: Array<{ from: Date; to: Date }> = [];
  // Start at (now - windowDays) and step forward in CHUNK_DAYS slices.
  for (let offset = 0; offset < windowDays; offset += CHUNK_DAYS) {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - windowDays + offset);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + CHUNK_DAYS);
    windows.push({ from, to });
  }
  return windows;
}

/**
 * In-memory semaphore to cap concurrent platform operations. BullMQ's
 * Worker { concurrency } caps job parallelism (we run 1 job at a time
 * per tenant), but each job internally runs N platforms × M chunks.
 * The semaphore caps the inner platform fan-out at CONCURRENCY=2.
 */
async function withSemaphore<T>(
  semaphore: { count: number; max: number; queue: Array<() => void> },
  fn: () => Promise<T>,
): Promise<T> {
  while (semaphore.count >= semaphore.max) {
    await new Promise<void>((resolve) => semaphore.queue.push(resolve));
  }
  semaphore.count += 1;
  try {
    return await fn();
  } finally {
    semaphore.count -= 1;
    const next = semaphore.queue.shift();
    if (next) next();
  }
}

// ─── Core (testable) ───────────────────────────────────────────────────────

/**
 * Pure runner. Splits the windowDays window into N(platforms) × 6 chunks
 * of 5 days each, throttles platform concurrency at CONCURRENCY, and
 * emits progress via job.updateProgress({step, totalSteps, message}).
 *
 * Exposed as a top-level export so Wave 0's
 * onboardingBackwashWorker.test.ts can call it directly with injected
 * pullChunk + job objects.
 */
export async function runBackwashJob(args: RunBackwashArgs): Promise<{
  totalChunks: number;
  perPlatform: Record<string, number>;
}> {
  const { tenantId, platforms, windowDays, pullChunk, job } = args;
  const windows = chunkWindows(windowDays); // 6 entries for windowDays=30
  const totalSteps = windows.length * platforms.length;

  let stepsDone = 0;
  const perPlatform: Record<string, number> = {};
  for (const p of platforms) perPlatform[p] = 0;

  const semaphore = { count: 0, max: CONCURRENCY, queue: [] as Array<() => void> };

  // Build a flat task list across (platform × window) pairs, then run with
  // the semaphore to enforce CONCURRENCY=2 throughout.
  const tasks: Array<() => Promise<void>> = [];
  for (const platform of platforms) {
    for (const w of windows) {
      tasks.push(async () => {
        await withSemaphore(semaphore, async () => {
          await pullChunk({
            tenantId,
            platform,
            from: isoDate(w.from),
            to: isoDate(w.to),
          });
          perPlatform[platform] += 1;
          stepsDone += 1;
          await job.updateProgress({
            step: stepsDone,
            totalSteps,
            message: `Pulling ${platform} ${isoDate(w.from)}..${isoDate(w.to)}`,
          });
        });
      });
    }
  }

  await Promise.all(tasks.map((t) => t()));

  return { totalChunks: stepsDone, perPlatform };
}

// ─── Phase-2 default pullChunk (counts existing OrderLog rows) ─────────────

/**
 * Phase-2 default chunk handler. Counts OrderLog rows that already exist
 * in the (tenantId, platform, window) window. Returns the count so the
 * wizard's progress message reflects realistic numbers.
 *
 * Wave 0's reportRender + design-partner-1 dry-run rely on the seed
 * fixture script having pre-populated rows BEFORE the wizard runs, so
 * this default returns non-zero counts when invoked against a properly
 * seeded tenant. Phase 6 swaps this for a real scraper invocation.
 *
 * NB: tenant-scoped via where:{tenantId}; lint:tenant compliant.
 */
export async function defaultPullChunkPhase2(
  args: BackwashChunkArgs,
): Promise<{ ordersPresent: number }> {
  const { tenantId, platform, from, to } = args;
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const ordersPresent = await prisma.orderLog.count({
    where: {
      tenantId,
      platform,
      date: { gte: fromDate, lt: toDate },
    },
  });
  return { ordersPresent };
}

// ─── Production queue accessors ────────────────────────────────────────────

let _queueSingleton: Queue<BackwashJobData> | null = null;

/**
 * Returns the BullMQ queue for the onboarding backwash. Returns null when
 * REDIS_URL is not configured (test / dev sandbox path); the route should
 * surface a 503 in that case.
 */
export function getOnboardingBackwashQueue(): Queue<BackwashJobData> | null {
  if (!env.REDIS_URL || env.REDIS_URL === "redis://localhost:6379") {
    logger?.warn?.("ONBOARDING_BACKWASH_QUEUE: REDIS_URL not configured; queue disabled");
    return null;
  }
  if (_queueSingleton) return _queueSingleton;
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  _queueSingleton = new Queue<BackwashJobData>(ONBOARDING_BACKWASH_QUEUE, { connection });
  return _queueSingleton;
}

/**
 * Look up a backwash job by id. Returns the {state, progress} shape the
 * /backwash-status route returns directly. Null when REDIS_URL is missing
 * or the job does not exist.
 */
export async function getBackwashJob(jobId: string): Promise<{
  id: string;
  state: string;
  progress: BackwashProgress;
} | null> {
  const queue = getOnboardingBackwashQueue();
  if (!queue) return null;
  const job = await queue.getJob(jobId);
  if (!job) return null;
  const state = await job.getState();
  const progressRaw = job.progress as BackwashProgress | number | undefined;
  let progress: BackwashProgress;
  if (progressRaw && typeof progressRaw === "object") {
    progress = progressRaw;
  } else {
    progress = {
      step: typeof progressRaw === "number" ? progressRaw : 0,
      totalSteps: 0,
      message: "",
    };
  }
  return { id: String(job.id), state, progress };
}

// ─── BullMQ worker (production) ────────────────────────────────────────────

/**
 * Boot the BullMQ worker. No-op when REDIS_URL is missing.
 *
 * Phase 2 shipped the worker with `defaultPullChunkPhase2` (which counted
 * existing OrderLog rows). Phase 6 Wave 4 wired in `pullChunkPhase6`, which
 * calls `getAdapter(platform, {tenantId}).fetch{Orders,Shifts,Attendance,
 * Violations}` per chunk and writes 1 IngestRun row (source: 'BACKWASH').
 * Per-chunk failures are captured as FAILED IngestRun rows (Pitfall 6) —
 * the 30-day window keeps iterating.
 */
export function startOnboardingBackwashWorker(): Worker<BackwashJobData> | null {
  if (!env.REDIS_URL || env.REDIS_URL === "redis://localhost:6379") {
    logger?.warn?.("startOnboardingBackwashWorker: REDIS_URL not configured; worker disabled");
    return null;
  }

  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

  const worker = new Worker<BackwashJobData>(
    ONBOARDING_BACKWASH_QUEUE,
    async (job: Job<BackwashJobData>) => {
      const { tenantId, platforms, windowDays } = job.data;
      logger?.info?.(
        { tenantId, platforms, windowDays, jobId: job.id },
        "onboarding backwash starting",
      );

      const result = await runBackwashJob({
        tenantId,
        platforms,
        windowDays,
        // Phase 6 Wave 4: real ingest-adapter invocation per chunk. The
        // Phase 2 `defaultPullChunkPhase2` stays exported for tests that
        // still inject it; production uses `pullChunkPhase6`.
        pullChunk: pullChunkPhase6,
        job: {
          updateProgress: async (p) => {
            await job.updateProgress(p);
          },
        },
      });

      logger?.info?.({ tenantId, jobId: job.id, ...result }, "onboarding backwash complete");
      return result;
    },
    {
      connection,
      // Worker concurrency caps job parallelism per worker process. The
      // platform fan-out cap (CONCURRENCY=2) lives inside runBackwashJob's
      // semaphore — a single worker still respects the inner cap.
      concurrency: 1,
    },
  );

  worker.on("completed", (job) => logger?.debug?.({ jobId: job.id }, "backwash completed"));
  worker.on("failed", (job, err) =>
    logger?.warn?.({ jobId: job?.id, err: err.message }, "backwash failed"),
  );
  worker.on("error", (err) => logger?.error?.({ err }, "backwash worker error"));

  logger?.info?.("onboarding backwash worker started");
  return worker;
}

// Allow running `tsx src/queues/onboardingBackwashWorker.ts` standalone
if (require.main === module) {
  startOnboardingBackwashWorker();
}
