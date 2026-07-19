// Darb 2.0 — Nightly wallet reconciliation worker (plan §A5 + §A10).
//
// BullMQ JobScheduler cron "15 0 * * *" tz Asia/Kuwait (Kuwait is UTC+3
// year-round, no DST — cron fires at a consistent wall-clock time). Each
// tick iterates ALL tenants and runs the four §A5 ledger invariant checks
// for the calendar day that just ended; MISMATCH handling (run row, CRITICAL
// Alert, ADMIN/ACCOUNTANT notifications, `wallet.reconciliation_failed`
// event) lives in services/wallet/reconciliationService.
//
// Pattern copied from scheduledBriefingsWorker.ts: singleton queue/
// connection/worker accessors behind a hasRedis() guard so the backend
// still boots without Redis, `startWalletReconciliationWorker()` export for
// the server listen block (wired in the integration phase — NOT here), and
// a `require.main === module` boot for a dedicated worker process:
//   tsx src/queues/walletReconciliationWorker.ts
//
// Exports:
//   - WALLET_RECONCILIATION_QUEUE — queue name constant.
//   - getWalletReconciliationQueue() — BullMQ Queue (null without Redis).
//   - ensureWalletReconciliationSchedule() — upserts the nightly
//     JobScheduler entry (idempotent).
//   - processTick(data) — pure tick processor (testable without BullMQ).
//   - startWalletReconciliationWorker() — boot the Worker (no-op without
//     Redis); also upserts the schedule.

import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "../config";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { runReconciliation } from "../services/wallet/reconciliationService";

export const WALLET_RECONCILIATION_QUEUE = "wallet-reconciliation";
const SCHEDULER_ID = "wallet-reconciliation-nightly";
const CRON_PATTERN = "15 0 * * *";

export interface WalletReconciliationTickData {
  /** Optional ISO date override (manual/backfill runs). Defaults to yesterday. */
  runDate?: string;
}

// ─── Queue + connection singletons ─────────────────────────────────────────

function hasRedis(): boolean {
  return !!env.REDIS_URL && env.REDIS_URL !== "redis://localhost:6379";
}

let _queueSingleton: Queue<WalletReconciliationTickData> | null = null;
let _connectionSingleton: IORedis | null = null;

function getConnection(): IORedis | null {
  if (!hasRedis()) return null;
  if (_connectionSingleton) return _connectionSingleton;
  _connectionSingleton = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return _connectionSingleton;
}

export function getWalletReconciliationQueue(): Queue<WalletReconciliationTickData> | null {
  if (!hasRedis()) {
    logger?.warn?.("walletReconciliation: REDIS_URL not configured; queue disabled");
    return null;
  }
  if (_queueSingleton) return _queueSingleton;
  const connection = getConnection();
  if (!connection) return null;
  _queueSingleton = new Queue<WalletReconciliationTickData>(WALLET_RECONCILIATION_QUEUE, {
    connection,
  });
  return _queueSingleton;
}

// ─── Schedule (BullMQ JobScheduler) ────────────────────────────────────────

/**
 * Upsert the nightly JobScheduler entry. Idempotent — BullMQ 5.x updates the
 * stored cron pattern in place for the same scheduler id.
 */
export async function ensureWalletReconciliationSchedule(): Promise<void> {
  const queue = getWalletReconciliationQueue();
  if (!queue) {
    logger?.warn?.(
      "walletReconciliation.ensureSchedule: queue disabled (no Redis); skipping"
    );
    return;
  }
  await queue.upsertJobScheduler(
    SCHEDULER_ID,
    { pattern: CRON_PATTERN, tz: "Asia/Kuwait" },
    { name: "wallet-reconciliation-tick", data: {} }
  );
}

// ─── Tick processor (pure, testable) ───────────────────────────────────────

/**
 * Process one nightly tick: reconcile every tenant for the calendar day that
 * just ended (the cron fires at 00:15, so "yesterday"). Per-tenant failures
 * are logged and skipped — one broken tenant must not starve the rest, and
 * throwing would make BullMQ retry-and-fan-out duplicate alarm chains.
 */
export async function processTick(
  data: WalletReconciliationTickData
): Promise<{ status: "completed"; tenants: number; mismatches: number; errors: number }> {
  const runDate = data.runDate
    ? new Date(data.runDate)
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d;
      })();

  // Tenant is intentionally not tenant-scoped — this is the cross-tenant
  // iteration entry point.
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  let mismatches = 0;
  let errors = 0;
  for (const tenant of tenants) {
    try {
      const run = await runReconciliation(tenant.id, runDate);
      if (run.status === "MISMATCH") {
        mismatches++;
        logger?.warn?.(
          { tenantId: tenant.id, runId: run.id },
          "walletReconciliationWorker: MISMATCH"
        );
      }
    } catch (err) {
      errors++;
      logger?.error?.(
        { tenantId: tenant.id, err: (err as Error).message },
        "walletReconciliationWorker: reconciliation threw for tenant"
      );
    }
  }

  return { status: "completed", tenants: tenants.length, mismatches, errors };
}

// ─── BullMQ worker (production) ────────────────────────────────────────────

let _workerSingleton: Worker<WalletReconciliationTickData> | null = null;

export function startWalletReconciliationWorker():
  | Worker<WalletReconciliationTickData>
  | null {
  if (!hasRedis()) {
    logger?.warn?.(
      "startWalletReconciliationWorker: REDIS_URL not configured; worker disabled"
    );
    return null;
  }
  if (_workerSingleton) return _workerSingleton;
  const connection = getConnection();
  if (!connection) return null;

  const worker = new Worker<WalletReconciliationTickData>(
    WALLET_RECONCILIATION_QUEUE,
    async (job: Job<WalletReconciliationTickData>) => {
      logger?.info?.({ jobId: job.id }, "walletReconciliationWorker: tick");
      return await processTick(job.data ?? {});
    },
    { connection, concurrency: 1 }
  );

  worker.on("completed", (job, result) =>
    logger?.debug?.({ jobId: job.id, result }, "wallet reconciliation tick completed")
  );
  worker.on("failed", (job, err) =>
    logger?.warn?.(
      { jobId: job?.id, err: err.message },
      "wallet reconciliation tick failed"
    )
  );
  worker.on("error", (err) =>
    logger?.error?.({ err }, "walletReconciliationWorker error")
  );

  // Bind the nightly cron whenever the worker boots (idempotent upsert).
  ensureWalletReconciliationSchedule().catch((err) =>
    logger?.warn?.(
      { err: (err as Error).message },
      "walletReconciliationWorker: failed to upsert schedule"
    )
  );

  logger?.info?.("walletReconciliationWorker started");
  _workerSingleton = worker;
  return worker;
}

// Allow `tsx src/queues/walletReconciliationWorker.ts` standalone.
if (require.main === module) {
  startWalletReconciliationWorker();
}
