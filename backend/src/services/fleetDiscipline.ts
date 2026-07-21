// Darb 2.0 PRD §9 — the fleet discipline ladder: warn → throttle → suspend →
// remove, driven by the fleet's rolling-30-day violation count (per-driver
// violations roll up to the employing FleetPartner). Discipline is per-fleet
// status plus per-driver dispatch effects:
//
//   WARNED    — notification to ops; no dispatch effect
//   THROTTLED — the fleet's drivers get throttledUntil (+7d): they sort AFTER
//               every non-throttled candidate in selectCandidates
//   SUSPENDED — the fleet's drivers' open sessions are forced OFFLINE (no
//               orders until ops lifts it)
//   REMOVED   — fleet isActive=false (manual re-activation only)
//
// The ladder only ESCALATES automatically; de-escalation is a manual ops
// decision (routes/fleets.ts discipline override) — a quiet week must not
// silently forgive a pattern ops is still investigating.

import { prisma } from "../config";
import { logger } from "../config/logger";

export const LADDER = ["OK", "WARNED", "THROTTLED", "SUSPENDED", "REMOVED"] as const;
export type DisciplineStatus = (typeof LADDER)[number];

/** Rolling-30d violation thresholds per ladder step (inclusive lower bounds). */
export const THRESHOLDS: Record<Exclude<DisciplineStatus, "OK">, number> = {
  WARNED: 5,
  THROTTLED: 10,
  SUSPENDED: 20,
  REMOVED: 40,
};

export const THROTTLE_DAYS = 7;

export function statusForViolationCount(count: number): DisciplineStatus {
  if (count >= THRESHOLDS.REMOVED) return "REMOVED";
  if (count >= THRESHOLDS.SUSPENDED) return "SUSPENDED";
  if (count >= THRESHOLDS.THROTTLED) return "THROTTLED";
  if (count >= THRESHOLDS.WARNED) return "WARNED";
  return "OK";
}

function rank(status: string): number {
  const i = LADDER.indexOf(status as DisciplineStatus);
  return i === -1 ? 0 : i;
}

const SUPERVISOR_ROLES = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"] as const;

async function notifyOps(tenantId: string, title: string, message: string, fleetPartnerId: string): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId, role: { in: [...SUPERVISOR_ROLES] }, isActive: true },
      select: { id: true },
    });
    if (users.length === 0) return;
    await prisma.notification.createMany({
      data: users.map((user) => ({
        tenantId,
        userId: user.id,
        title,
        message,
        type: "FLEET_DISCIPLINE",
        severity: "HIGH",
        sourceId: fleetPartnerId,
        category: "OPS_TODO",
        metadata: { fleetPartnerId },
      })),
    });
  } catch (err) {
    logger.warn({ err, fleetPartnerId }, "fleet discipline notification failed");
  }
}

/**
 * Evaluate every active fleet of a tenant and escalate where the rolling-30d
 * violation count crosses a threshold. Escalation-only (see header). Returns
 * the number of fleets whose status changed.
 */
export async function applyFleetDiscipline(tenantId: string): Promise<number> {
  const fleets = await prisma.fleetPartner.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, disciplineStatus: true },
  });
  if (fleets.length === 0) return 0;

  const since = new Date(Date.now() - 30 * 86_400_000);
  let changed = 0;

  for (const fleet of fleets) {
    try {
      const violations = await prisma.violation.count({
        where: {
          tenantId,
          violationTime: { gte: since },
          violationStatus: { not: "OVERTURNED" },
          driver: { fleetPartnerId: fleet.id },
        },
      });

      const target = statusForViolationCount(violations);
      if (rank(target) <= rank(fleet.disciplineStatus)) continue; // escalate only

      await prisma.fleetPartner.updateMany({
        where: { id: fleet.id, tenantId },
        data: {
          disciplineStatus: target,
          disciplineNote: `${violations} violations in 30d → ${target} (auto, ${new Date().toISOString().slice(0, 10)})`,
          ...(target === "REMOVED" ? { isActive: false } : {}),
        },
      });
      changed += 1;

      if (target === "THROTTLED") {
        await prisma.driver.updateMany({
          where: { tenantId, fleetPartnerId: fleet.id },
          data: { throttledUntil: new Date(Date.now() + THROTTLE_DAYS * 86_400_000) },
        });
      }
      if (target === "SUSPENDED" || target === "REMOVED") {
        // No orders until it returns: force the fleet's open sessions OFFLINE.
        await prisma.courierOnlineSession.updateMany({
          where: { tenantId, isOnline: true, driver: { fleetPartnerId: fleet.id } },
          data: { availability: "OFFLINE" },
        });
      }

      await notifyOps(
        tenantId,
        `Fleet ${target.toLowerCase()}: ${fleet.name}`,
        `${fleet.name} escalated to ${target} (${violations} violations in the last 30 days). Review from the fleets page.`,
        fleet.id,
      );
    } catch (err) {
      logger.error({ err, fleetPartnerId: fleet.id }, "applyFleetDiscipline: fleet failed");
    }
  }
  return changed;
}
