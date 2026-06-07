/**
 * Active-platform attribution — given a (tenant, driver) pair, decide which
 * delivery platform the courier is most likely "on" right now.
 *
 * Why this matters: a courier in Kuwait can hold simultaneous app sessions on
 * Keeta, Talabat, and Deliveroo. When a GPS point lands on the backend, we
 * need to assign it to ONE platform for analytics (idle attribution, KPI
 * tier, score components). The mobile agent already sends `platformGuess`
 * scraped from the active foreground app, but that is untrusted and easy to
 * forge — so we corroborate with server-side evidence in a tiered cascade:
 *
 *   Tier 1 — HIGH  / order_event    — A recent (last 30 min) OrderEvent for
 *                                     this driver, on this tenant. Strongest
 *                                     evidence: the platform actually told us
 *                                     this courier did something.
 *   Tier 2 — MEDIUM / shift         — An IN_PROGRESS Shift for this driver.
 *                                     Reasonable but stale (a courier might
 *                                     have ended the shift in the app and not
 *                                     clocked out in Darb).
 *   Tier 3a — LOW    / driver_default — Driver.platform — the platform the
 *                                       courier was hired on. Worst signal.
 *   Tier 3b — MEDIUM / mobile_hint  — Driver.platform matches what the mobile
 *                                     hint claims → upgrade confidence.
 *   UNKNOWN — driver missing or driver.tenantId != tenantId (cross-tenant leak
 *             guard).
 *
 * Tenant scoping is enforced on EVERY query. The `lint:tenant` script asserts
 * that no Prisma where-clause in this file omits `tenantId`.
 *
 * Threats addressed:
 *   T-05-02-02 (cross-tenant platform leak) — every query filters tenantId;
 *              cross-tenant test asserts shift in tenantB does NOT match for
 *              a tenantA caller.
 */
import { prisma } from "../config";
import type { Platform } from "../generated/prisma";

export interface ActivePlatformResult {
  platform: Platform | null;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  source: "order_event" | "shift" | "driver_default" | "mobile_hint" | "none";
  evidence: { id?: string; at?: Date; text?: string };
}

export interface ResolveArgs {
  tenantId: string;
  driverId: string;
  at?: Date;
  mobileHint?: Platform | null;
}

const THIRTY_MIN_MS = 30 * 60 * 1000;

export async function resolveActivePlatform(
  args: ResolveArgs,
): Promise<ActivePlatformResult> {
  const at = args.at ?? new Date();
  const since = new Date(at.getTime() - THIRTY_MIN_MS);

  // Tier 1 — Recent OrderEvent (HIGH).
  // OrderEvent has no driverId column → we identify the driver via either
  // `operatorId` (mobile sets operatorId=driverId on delivery-photo events)
  // or via `metadata.driverId` (older imports / Phase 6 ingest adapters).
  // Both branches are scoped by `tenantId`.
  const recentEvent = await prisma.orderEvent
    .findFirst({
      where: {
        tenantId: args.tenantId,
        timestamp: { gte: since, lte: at },
        OR: [
          { operatorId: args.driverId },
          { metadata: { path: ["driverId"], equals: args.driverId } as any },
        ],
      },
      orderBy: { timestamp: "desc" },
      select: { id: true, timestamp: true, metadata: true },
    })
    .catch(() => null);

  if (recentEvent) {
    // Platform may live in metadata.platform — extract or fall through to
    // null platform (still HIGH confidence that the courier is active, just
    // no platform tag on the event).
    const meta = (recentEvent.metadata ?? {}) as Record<string, unknown>;
    const platform =
      typeof meta.platform === "string" ? (meta.platform as Platform) : null;
    return {
      platform,
      confidence: "HIGH",
      source: "order_event",
      evidence: { id: recentEvent.id, at: recentEvent.timestamp },
    };
  }

  // Tier 2 — IN_PROGRESS Shift (MEDIUM).
  const activeShift = await prisma.shift.findFirst({
    where: {
      tenantId: args.tenantId,
      driverId: args.driverId,
      status: "IN_PROGRESS",
      actualStart: { lte: at },
    },
    orderBy: { actualStart: "desc" },
    select: { id: true, platform: true, actualStart: true },
  });

  if (activeShift) {
    return {
      platform: activeShift.platform,
      confidence: "MEDIUM",
      source: "shift",
      evidence: { id: activeShift.id, at: activeShift.actualStart ?? undefined },
    };
  }

  // Tier 3 — Driver default (LOW) or mobile-hint match (MEDIUM).
  // We use findFirst with `{ id, tenantId }` (NOT findUnique) so the DB
  // layer itself enforces the cross-tenant boundary — a driver row that
  // belongs to a different tenant simply will not be returned, eliminating
  // any post-fetch race / forgotten-check risk. Defense-in-depth + this is
  // what the static `lint:tenant` rule requires.
  const driver = await prisma.driver.findFirst({
    where: { id: args.driverId, tenantId: args.tenantId },
    select: { platform: true },
  });

  if (!driver) {
    return {
      platform: null,
      confidence: "UNKNOWN",
      source: "none",
      evidence: { text: "driver not found or wrong tenant" },
    };
  }

  const matchesHint =
    args.mobileHint != null && args.mobileHint === driver.platform;
  return {
    platform: driver.platform,
    confidence: matchesHint ? "MEDIUM" : "LOW",
    source: matchesHint ? "mobile_hint" : "driver_default",
    evidence: {
      text: matchesHint ? "default + mobile-hint match" : "driver.platform default",
    },
  };
}
