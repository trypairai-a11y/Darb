/**
 * finalize-darb2-demo.ts — post-seed cleanup so the live control room only
 * shows genuinely live work.
 *
 * A historical order must end in a terminal state. Anything left in CREATED /
 * DISPATCHING / NO_DRIVER / ASSIGNED / PICKED_UP from a previous day is either
 *   - an order the seed was interrupted mid-lifecycle, or
 *   - a NO_DRIVER order nobody ever closed out,
 * and either way it renders on /ops forever with an absurd negative SLA
 * countdown (e.g. -86144:42), because its slaDeadline is weeks in the past.
 *
 * This walks each one to a terminal state through the real FSM, so the
 * timeline and OrderEvent history stay truthful, then backdates the closing
 * event to the order's own day rather than today.
 *
 * Today's in-flight orders (the live snapshot) are left untouched.
 *
 * Run: cd backend && npx tsx prisma/finalize-darb2-demo.ts
 */
import { PrismaClient } from "../src/generated/prisma";
import { cancelOrder, completeDelivery } from "../src/services/orderService";

const prisma = new PrismaClient({
  transactionOptions: { timeout: 45_000, maxWait: 20_000 },
});

const LIVE_STATUSES = ["CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED", "PICKED_UP"] as const;
const ts = (d: Date) => d.toISOString().replace("Z", "");

async function main() {
  const tenant =
    (await prisma.tenant.findFirst({ where: { name: "Osama Fleet Management" } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) throw new Error("No tenant found.");
  const tid = tenant.id;

  const admin = await prisma.user.findFirst({ where: { tenantId: tid, role: "ADMIN" } });
  if (!admin) throw new Error("No ADMIN user.");
  const actor = { type: "USER" as const, id: admin.id, name: admin.name ?? "Ops" };

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const stranded = await prisma.deliveryOrder.findMany({
    where: { tenantId: tid, status: { in: [...LIVE_STATUSES] }, createdAt: { lt: todayStart } },
    select: { id: true, orderNumber: true, status: true, createdAt: true, driverId: true, paymentMethod: true, orderTotalKwd: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Stranded historical orders: ${stranded.length}`);

  let delivered = 0;
  let cancelled = 0;

  for (const o of stranded) {
    // Close on the order's own day, ~40 minutes after it was created.
    const closedAt = new Date(o.createdAt.getTime() + 40 * 60_000);
    try {
      if (o.status === "PICKED_UP" && o.driverId) {
        // Already with a courier — the honest ending is a completed delivery.
        await completeDelivery({
          tenantId: tid, orderId: o.id, actor,
          codCollectedKwd: o.paymentMethod === "COD" ? o.orderTotalKwd.toString() : undefined,
          podMethod: "PIN",
        });
        delivered++;
      } else {
        await cancelOrder({
          tenantId: tid, orderId: o.id,
          reason: o.status === "NO_DRIVER"
            ? "No driver accepted after 8 offer rounds"
            : "Closed out by rider support (dispatch abandoned)",
          actor, allowFrom: [...LIVE_STATUSES],
        });
        cancelled++;
      }

      await prisma.$executeRawUnsafe(`
        UPDATE "DeliveryOrder" SET
          "updatedAt"   = '${ts(closedAt)}'::timestamp,
          "cancelledAt" = CASE WHEN "cancelledAt" IS NULL THEN NULL ELSE '${ts(closedAt)}'::timestamp END,
          "deliveredAt" = CASE WHEN "deliveredAt" IS NULL THEN NULL ELSE '${ts(closedAt)}'::timestamp END
        WHERE id = '${o.id}' AND "tenantId" = '${tid}'
      `);
      await prisma.$executeRawUnsafe(`
        UPDATE "OrderEvent" SET "timestamp" = '${ts(closedAt)}'::timestamp, "createdAt" = '${ts(closedAt)}'::timestamp
        WHERE "orderId" = '${o.id}' AND "tenantId" = '${tid}'
          AND action IN ('order.cancelled','order.delivered')
      `);
      // Settlement postings for a late-closed delivery belong on that day too.
      await prisma.$executeRawUnsafe(`
        UPDATE "WalletTransaction" SET "createdAt" = '${ts(closedAt)}'::timestamp
        WHERE "tenantId" = '${tid}' AND "orderId" = '${o.id}'
      `);
      await prisma.$executeRawUnsafe(`
        UPDATE "WalletEntry" we SET "createdAt" = wt."createdAt"
        FROM "WalletTransaction" wt
        WHERE we."transactionId" = wt.id AND we."tenantId" = '${tid}' AND wt."orderId" = '${o.id}'
      `);
      console.log(`  ${o.orderNumber.padEnd(15)} ${o.status.padEnd(12)} → closed on ${closedAt.toISOString().slice(0, 10)}`);
    } catch (err) {
      console.warn(`  ${o.orderNumber}: ${(err as Error).message}`);
    }
  }

  console.log(`\nClosed ${delivered} as DELIVERED, ${cancelled} as CANCELLED.`);

  const remaining = await prisma.deliveryOrder.count({
    where: { tenantId: tid, status: { in: [...LIVE_STATUSES] }, createdAt: { lt: todayStart } },
  });
  const liveToday = await prisma.deliveryOrder.count({
    where: { tenantId: tid, status: { in: [...LIVE_STATUSES] }, createdAt: { gte: todayStart } },
  });
  console.log(`Stranded remaining: ${remaining} (must be 0) | genuinely live today: ${liveToday}`);
  if (remaining > 0) process.exitCode = 1;
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(process.exitCode ?? 0); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
