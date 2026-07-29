/**
 * Drive the dispatch sweep off ordinary traffic.
 *
 * On Vercel Hobby the platform will only schedule a cron once a day, and this
 * deployment has no long-lived host, so /api/cron/dispatch-sweep — the single
 * thing that expires offers, returns NO_DRIVER orders to dispatch on their
 * backoff, releases scheduled orders and keeps demo presence alive — fires at
 * 03:00 and not again. An order placed at 09:00 waits until tomorrow. That is
 * not a dispatch bug, but to anyone watching it is indistinguishable from one.
 *
 * A proper minute-level ticker (GitHub Actions, cron-job.org, or Vercel Pro
 * with "* * * * *") is still the right answer, because it runs whether or not
 * a human is looking. This is the floor underneath it: while somebody has the
 * ops console open, their own requests keep the queue moving.
 *
 * Rules it plays by:
 *   - never blocks the response. The caller gets their data; the sweep runs
 *     after, and a failure is logged, never surfaced.
 *   - debounced per lambda instance, so a dashboard polling every few seconds
 *     triggers at most one sweep a minute.
 *   - concurrent sweeps across instances are harmless by construction: every
 *     mutation underneath is a status-guarded updateMany, so only one caller
 *     wins each row. That is the same property that lets the cron endpoint run
 *     alongside a BullMQ worker.
 *   - off unless OPPORTUNISTIC_SWEEP=true.
 */
import { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";
import { sweepDispatch } from "./dispatch/dispatchEngine";
import { sweepScheduledOrders } from "./orderService";
import { refreshDemoPresence } from "./demoPresenceService";

/** Shortest gap between two traffic-driven sweeps, per instance. */
const MIN_INTERVAL_MS = 60_000;

/** Epoch ms of the last sweep this instance started. */
let lastSweepAt = 0;
/** In-flight guard: a slow sweep must not stack behind the next request. */
let running = false;

/** Test seam — resets the debounce so cases do not leak into each other. */
export function __resetSweepClock(): void {
  lastSweepAt = 0;
  running = false;
}

export function opportunisticSweepEnabled(): boolean {
  return process.env.OPPORTUNISTIC_SWEEP === "true";
}

/**
 * Run a sweep if one is due. Resolves when the sweep finishes; callers that
 * must not wait should not await it.
 */
export async function maybeSweep(now: number = Date.now()): Promise<boolean> {
  if (!opportunisticSweepEnabled()) return false;
  if (running) return false;
  if (now - lastSweepAt < MIN_INTERVAL_MS) return false;

  // Claim the slot BEFORE any await, so two requests arriving in the same tick
  // cannot both pass the check above.
  lastSweepAt = now;
  running = true;
  try {
    await refreshDemoPresence();
    await sweepScheduledOrders();
    const result = await sweepDispatch();
    logger.info({ ...result, trigger: "traffic" }, "opportunistic dispatch sweep");
    return true;
  } catch (err) {
    logger.warn({ err }, "opportunistic dispatch sweep failed");
    return false;
  } finally {
    running = false;
  }
}

/**
 * Express middleware. Passes the request straight through and sweeps once the
 * response has been sent, so no user ever waits on it.
 *
 * It waits for 'finish' rather than sweeping inline because this router is
 * mounted ahead of the route's own authMiddleware: at call time there is no
 * req.user to check, and sweeping there would let an unauthenticated 401 —
 * a crawler, a stale bookmark, anyone at all — drive cross-tenant work. By
 * the time the response finishes, auth has run and said so, so a successful
 * status is the proof that a real logged-in operator asked for this.
 */
export function opportunisticSweepMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!opportunisticSweepEnabled()) {
    next();
    return;
  }
  res.once("finish", () => {
    // 401/403 never reaches here as a success, so anonymous traffic cannot
    // keep the queue warm.
    if (res.statusCode >= 400) return;
    void maybeSweep().catch(() => {});
  });
  next();
}
