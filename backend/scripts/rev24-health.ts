/**
 * rev24-health.ts — revision 24, read-only health report.
 *
 * Prints the counts that show revision 24 is behaving in a given database, so
 * the account owner can be handed one block of numbers instead of a story.
 * It WRITES NOTHING: every call below is a count, groupBy or findMany.
 *
 *   cd backend
 *   npx tsx scripts/rev24-health.ts                 # every tenant
 *   npx tsx scripts/rev24-health.ts --tenant=<id>   # one tenant
 *
 * Reads DATABASE_URL from the environment (.env via dotenv). The app config
 * also connects to Redis and can be noisy, so the result is repeated at the
 * end as lines prefixed "REV24 HEALTH":
 *
 *   npx tsx scripts/rev24-health.ts 2>&1 | grep "^REV24 HEALTH"
 *
 * What "healthy" means, line by line:
 *   stale ASSIGNED/ARRIVED > 24h   0 after the nightly stale-order sweep (#18).
 *                                  Orders on their way back to the shop are
 *                                  flagged to ops, never cancelled, so they are
 *                                  counted separately and are not a failure.
 *   open REJECTED out-of-area      shrinks to 0 once the backlog is closed
 *                                  (scripts/close-out-of-area-orders.ts, #4);
 *                                  only the webhooks can add new ones.
 *   private shifts by status       any rows at all means #8 to #11 are in use.
 *   AccountSettlement rows         any rows means the Settle accounts tab (#2)
 *                                  has recorded a transfer.
 *   pending termination clearance  drivers TERMINATED with no clearance (#16).
 *   maxActiveOrdersPerDriver       per tenant; "3 (default, no settings row)"
 *                                  when the tenant never saved settings (#5).
 */
import "dotenv/config";
import { prisma } from "../src/config";
import { isReturningToMerchant } from "../src/services/orderStateMachine";
import { STALE_AFTER_HOURS, STALE_CLOSE_STATUSES } from "../src/services/staleOrderService";

// Mirrors dispatchEngine's DEFAULT_MAX_ACTIVE_ORDERS_PER_DRIVER and the schema
// default. Not imported: the dispatch engine pulls in the queue layer, and a
// read-only report has no business loading it.
const DEFAULT_MAX_ACTIVE_ORDERS_PER_DRIVER = 3;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? "true" : hit.slice(eq + 1);
}

type Line = { label: string; value: string; ok?: boolean };

async function main() {
  const tenantId = arg("tenant");
  const scope = tenantId ? { tenantId } : {};
  const now = new Date();
  const cutoff = new Date(now.getTime() - STALE_AFTER_HOURS * 3_600_000);

  // eslint-disable-next-line no-restricted-syntax -- read-only ops report, cross-tenant unless --tenant is given
  const tenants = await prisma.tenant.findMany({
    where: tenantId ? { id: tenantId } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // ── #18 stale orders ───────────────────────────────────────────────────────
  // eslint-disable-next-line no-restricted-syntax -- read-only ops report
  const stale = await prisma.deliveryOrder.findMany({
    where: { ...scope, status: { in: STALE_CLOSE_STATUSES }, updatedAt: { lt: cutoff } },
    select: { id: true, tenantId: true, orderNumber: true, status: true, updatedAt: true, metadata: true },
    orderBy: { updatedAt: "asc" },
  });
  const staleReturning = stale.filter((o) => isReturningToMerchant(o));
  const staleShouldBeClosed = stale.filter((o) => !isReturningToMerchant(o));

  // ── #4 out-of-area refusals still open ─────────────────────────────────────
  // eslint-disable-next-line no-restricted-syntax -- read-only ops report
  const rejectedOutOfZone = await prisma.deliveryOrder.count({
    where: { ...scope, status: "REJECTED", rejectionReason: "OUT_OF_ZONE_DROPOFF" },
  });

  // ── #8 to #11 private shifts ───────────────────────────────────────────────
  // eslint-disable-next-line no-restricted-syntax -- read-only ops report
  const privateByStatus = await prisma.privateShift.groupBy({
    by: ["status"],
    where: scope,
    _count: { _all: true },
  });
  const privateTotal = privateByStatus.reduce((s, r) => s + r._count._all, 0);

  // ── #2 settlements ─────────────────────────────────────────────────────────
  // eslint-disable-next-line no-restricted-syntax -- read-only ops report
  const settlementsByParty = await prisma.accountSettlement.groupBy({
    by: ["partyType", "status"],
    where: scope,
    _count: { _all: true },
  });
  const settlementTotal = settlementsByParty.reduce((s, r) => s + r._count._all, 0);

  // ── #16 termination clearance ──────────────────────────────────────────────
  // eslint-disable-next-line no-restricted-syntax -- read-only ops report
  const pendingClearance = await prisma.driver.findMany({
    where: { ...scope, status: "TERMINATED", terminationClearedAt: null },
    select: { id: true, name: true, terminatedAt: true },
    orderBy: { name: "asc" },
  });
  // eslint-disable-next-line no-restricted-syntax -- read-only ops report
  const kitStillOut = pendingClearance.length
    ? await prisma.driverInventory.count({
        where: { driverId: { in: pendingClearance.map((d) => d.id) }, issued: true, returnedDate: null },
      })
    : 0;

  // ── #5 busy-driver cap ─────────────────────────────────────────────────────
  // eslint-disable-next-line no-restricted-syntax -- read-only ops report
  const settings = await prisma.fulfillmentSettings.findMany({
    where: tenantId ? { tenantId } : {},
    select: { tenantId: true, maxActiveOrdersPerDriver: true },
  });
  const capByTenant = new Map(settings.map((s) => [s.tenantId, s.maxActiveOrdersPerDriver]));

  // ── Detail (above the summary, for whoever wants to dig) ───────────────────
  console.log(`\nRevision 24 health report, ${now.toISOString()}${tenantId ? `, tenant ${tenantId}` : ", all tenants"}`);
  if (staleShouldBeClosed.length) {
    console.log(`\nStale ${STALE_CLOSE_STATUSES.join("/")} orders the sweep should have closed (oldest first, up to 20):`);
    for (const o of staleShouldBeClosed.slice(0, 20)) {
      console.log(`  ${o.orderNumber}  ${o.status}  last moved ${o.updatedAt.toISOString()}  tenant ${o.tenantId}`);
    }
  }
  if (pendingClearance.length) {
    console.log(`\nDrivers pending termination clearance (up to 20):`);
    for (const d of pendingClearance.slice(0, 20)) {
      console.log(`  ${d.name}  terminated ${d.terminatedAt ? d.terminatedAt.toISOString().slice(0, 10) : "before revision 24"}`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const lines: Line[] = [
    {
      label: `stale ASSIGNED/ARRIVED older than ${STALE_AFTER_HOURS}h (should be 0)`,
      value: String(staleShouldBeClosed.length),
      ok: staleShouldBeClosed.length === 0,
    },
    {
      label: `stale but returning to the shop (flagged to ops, not cancelled)`,
      value: String(staleReturning.length),
    },
    {
      label: "open REJECTED OUT_OF_ZONE_DROPOFF orders",
      value: String(rejectedOutOfZone),
      ok: rejectedOutOfZone === 0,
    },
    {
      label: "private shifts",
      value:
        privateTotal === 0
          ? "0"
          : `${privateTotal} (${privateByStatus
              .sort((a, b) => String(a.status).localeCompare(String(b.status)))
              .map((r) => `${r.status} ${r._count._all}`)
              .join(", ")})`,
    },
    {
      label: "AccountSettlement rows",
      value:
        settlementTotal === 0
          ? "0"
          : `${settlementTotal} (${settlementsByParty
              .map((r) => `${r.partyType} ${r.status} ${r._count._all}`)
              .join(", ")})`,
    },
    {
      label: "drivers pending termination clearance",
      value: `${pendingClearance.length} (${kitStillOut} equipment row(s) still issued to them)`,
    },
    ...tenants.map((t) => {
      const cap = capByTenant.get(t.id);
      return {
        label: `maxActiveOrdersPerDriver, ${t.name} (${t.id})`,
        value:
          cap == null
            ? `${DEFAULT_MAX_ACTIVE_ORDERS_PER_DRIVER} (default, no settings row)`
            : cap === 1
              ? "1 (busy drivers are offered nothing)"
              : String(cap),
      };
    }),
  ];

  const width = Math.max(...lines.map((l) => l.label.length));
  console.log("");
  console.log("REV24 HEALTH ========================================");
  console.log(`REV24 HEALTH generated ${now.toISOString()} | ${tenantId ? `tenant ${tenantId}` : `${tenants.length} tenant(s)`}`);
  for (const l of lines) {
    const flag = l.ok === undefined ? "    " : l.ok ? "OK  " : "LOOK";
    console.log(`REV24 HEALTH ${flag} ${l.label.padEnd(width)}  ${l.value}`);
  }
  console.log("REV24 HEALTH ========================================");
}

main()
  .catch((err) => {
    console.error("REV24 HEALTH FAILED", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // The app config opens Redis; do not let it hold the process open.
    process.exit(process.exitCode ?? 0);
  });
