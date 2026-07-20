// Darb 2.0 — /api/cron. Serverless replacement for the in-process schedulers.
//
// Why this router exists: server.ts boots every scheduler and BullMQ worker
// inside `if (process.env.VERCEL !== "1") { app.listen(...) }`. On the Vercel
// deploy that block never runs, and there is no Redis configured either, so
// the dispatch offer-expiry timer has no home: offers open with a 15s window
// and stay OFFERED forever. A lambda also freezes once it has responded, so an
// in-process setTimeout cannot be the fix — the work has to be driven from
// durable state (DispatchOffer.expiresAt, CourierOnlineSession.lastGpsAt) by
// an external tick. Vercel Cron provides that tick.
//
// Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. This router is
// mounted BEFORE authMiddleware and carries its own guard — it is not
// tenant-scoped, because a sweep is cross-tenant by design (mirrors
// routes/admin). It fails CLOSED: with CRON_SECRET unset the endpoint is
// disabled rather than public.
//
// Idempotent and safe to call at any frequency, and safe to run alongside the
// real BullMQ worker on a long-lived host — every mutation underneath is a
// status-guarded updateMany, so only one caller wins each row.

import { Router, Request, Response } from "express";
import { logger } from "../config/logger";
import { sweepDispatch } from "../services/dispatch/dispatchEngine";
import { sweepStalePresence } from "../services/gpsMonitorService";
import { sweepScheduledOrders } from "../services/orderService";

const router = Router();

/** Constant-time-ish compare; lengths differ far more often than contents. */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function authorizeCron(req: Request, res: Response): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail closed — an unset secret must not leave a cross-tenant sweep open.
    logger.error("cron: CRON_SECRET is not configured — endpoint disabled");
    res.status(503).json({ error: "Cron is not configured" });
    return false;
  }

  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !secretMatches(token, expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

/**
 * GET /api/cron/dispatch-sweep
 *
 * Presence first, then dispatch: forcing GPS-stale couriers OFFLINE before the
 * dispatch sweep means the rounds it advances pick from a candidate pool that
 * no longer contains drivers who have gone dark. Reversing the order would
 * hand the next offer straight back to a stale driver.
 *
 * KNOWN LATENCY TRADE-OFF: an offer becomes unacceptable to its courier the
 * instant its 15s window elapses (acceptOffer guards on expiresAt > now), but
 * the order only advances on the next tick. At Vercel's one-minute cron
 * granularity a round therefore costs up to ~75s of wall clock instead of 15s,
 * so an unaccepted order takes N minutes rather than N x 15s to reach
 * NO_DRIVER. That is a real degradation versus a Redis-backed always-on host,
 * and it is the price of having dispatch work at all on this deploy. Moving
 * the workers to a long-lived host removes it.
 */
router.get("/dispatch-sweep", async (req: Request, res: Response) => {
  if (!authorizeCron(req, res)) return;

  const startedAt = Date.now();
  try {
    let presenceOffline = 0;
    try {
      presenceOffline = await sweepStalePresence();
    } catch (err) {
      // A presence failure must not block the dispatch sweep — that is the leg
      // that leaves orders wedged.
      logger.warn({ err }, "cron: presence sweep failed, continuing to dispatch");
    }

    // Leg 0 (PRD §6): due scheduled orders enter DISPATCHING before the
    // dispatch sweep so they get their first offer on the same tick.
    let scheduledAdvanced = 0;
    try {
      scheduledAdvanced = await sweepScheduledOrders();
    } catch (err) {
      logger.warn({ err }, "cron: scheduled-orders sweep failed, continuing to dispatch");
    }

    const dispatch = await sweepDispatch();

    return res.json({
      ok: true,
      presenceOffline,
      scheduledAdvanced,
      ...dispatch,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    logger.error({ err: error }, "cron: dispatch sweep failed");
    return res.status(500).json({ error: "Dispatch sweep failed" });
  }
});

export default router;
