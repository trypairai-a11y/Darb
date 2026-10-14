/**
 * clear-stale-orders.ts — revision 24 (#18), one-off backlog clearance.
 *
 * Orders stuck "Arrived at shop" (and every other driver-held or waiting
 * status) since July. This is the same sweep /api/cron/daily now runs every
 * night (src/services/staleOrderService.ts), run by hand once for the backlog
 * that is already there:
 *
 *   - ASSIGNED / ARRIVED untouched for 24h: CANCELLED, reason "Closed
 *     automatically: not collected from the shop within 24 hours", driver
 *     released, no customer message, no money posted (it was never picked up).
 *   - PICKED_UP / FAILED / returning / DISPATCHING / NO_DRIVER / due CREATED:
 *     FLAGGED only (metadata.staleFlaggedAt + one ops notification per
 *     tenant). Nothing is moved where goods or cash may be with a driver, and
 *     nothing is cancelled for want of a driver.
 *
 * DRY RUN BY DEFAULT. Prints every order and what would happen to it.
 *
 *   cd backend
 *   npx tsx scripts/clear-stale-orders.ts                    # dry run, all tenants
 *   npx tsx scripts/clear-stale-orders.ts --tenant=<id>      # one tenant
 *   npx tsx scripts/clear-stale-orders.ts --hours=48         # different threshold
 *   npx tsx scripts/clear-stale-orders.ts --apply            # actually do it
 *
 * Reads DATABASE_URL from the environment (.env via dotenv).
 */
import "dotenv/config";
import { prisma } from "../src/config";
import { STALE_AFTER_HOURS, sweepStaleOrders } from "../src/services/staleOrderService";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? "true" : hit.slice(eq + 1);
}

async function main() {
  const apply = arg("apply") === "true";
  const tenantId = arg("tenant");
  const hours = Number(arg("hours") ?? STALE_AFTER_HOURS);
  if (!Number.isFinite(hours) || hours < 1) throw new Error("--hours must be a positive number");

  console.log(
    `${apply ? "APPLYING" : "DRY RUN (add --apply to write)"}: orders untouched for ${hours}h` +
      (tenantId ? `, tenant ${tenantId}` : ", all tenants"),
  );

  // Run in passes of 500 until nothing is left (apply), or once (dry run).
  let pass = 0;
  let closed = 0;
  let flagged = 0;
  let skipped = 0;
  for (;;) {
    pass += 1;
    const result = await sweepStaleOrders({ dryRun: !apply, tenantId, staleAfterHours: hours, limit: 500 });
    for (const o of result.orders) {
      const days = Math.floor((Date.now() - o.updatedAt.getTime()) / 86_400_000);
      console.log(
        `  ${o.action === "CLOSE" ? "close" : "flag "}  ${o.orderNumber.padEnd(18)} ${o.status.padEnd(12)} ${String(days).padStart(3)}d idle  tenant ${o.tenantId}`,
      );
    }
    closed += result.closed;
    flagged += result.flagged;
    skipped += result.skipped;
    if (!apply || result.orders.length === 0 || pass >= 20) break;
  }

  console.log(
    `\n${apply ? "Done" : "Would do"}: ${closed} closed, ${flagged} flagged for ops, ${skipped} skipped (already flagged or moved meanwhile).`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
