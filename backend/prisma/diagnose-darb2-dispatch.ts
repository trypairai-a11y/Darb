/**
 * diagnose-darb2-dispatch.ts — why is an order sitting on Dispatching?
 *
 * Read-only. It writes nothing, anywhere. Answers the four questions that
 * decide between "the sweep is not running" and "there is nobody to offer to":
 *
 *   1. what state are the live orders actually in,
 *   2. how long has each been waiting and when is its next retry due,
 *   3. how many couriers are ONLINE with GPS fresh enough to be a candidate,
 *   4. what the tenant's FulfillmentSettings say the freshness window is.
 *
 * Run: cd backend && npx tsx prisma/diagnose-darb2-dispatch.ts [envfile]
 * Default envfile is .env.vercel.prod (production). Pass .env for local.
 */
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma";

const envFile = process.argv[2] ?? ".env.vercel.prod";
const parsed = dotenv.config({ path: envFile }).parsed;
const url = parsed?.DATABASE_URL;
if (!url) throw new Error(`no DATABASE_URL in ${envFile}`);

const prisma = new PrismaClient({ datasources: { db: { url } } });

const ago = (d: Date | null | undefined) =>
  d ? `${Math.round((Date.now() - d.getTime()) / 60000)}m ago` : "never";

async function main() {
  console.log(`env: ${envFile}  host: ${url!.split("@")[1]?.split("/")[0]}`);
  console.log(`now: ${new Date().toISOString()}`);

  const byStatus = await prisma.deliveryOrder.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  console.log("\n=== order status counts ===");
  byStatus.forEach((r) => console.log(`  ${r.status}: ${r._count._all}`));

  const live = await prisma.deliveryOrder.findMany({
    where: { status: { in: ["CREATED", "DISPATCHING", "NO_DRIVER"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      offerRound: true,
      redispatchAttempts: true,
      nextRedispatchAt: true,
      scheduledAt: true,
      tenantId: true,
      branch: { select: { name: true, lat: true, lng: true } },
    },
  });
  console.log("\n=== live orders (newest first) ===");
  for (const o of live) {
    console.log(
      `  ${o.orderNumber}  ${o.status}  age=${ago(o.createdAt)}  round=${o.offerRound}  ` +
        `retries=${o.redispatchAttempts}  nextRetry=${o.nextRedispatchAt?.toISOString() ?? "-"}  ` +
        `pickup=${o.branch?.name ?? "?"}(${o.branch?.lat},${o.branch?.lng})  tenant=${o.tenantId}`,
    );
  }

  const tenants = [...new Set(live.map((o) => o.tenantId))];
  const demoTenants = (process.env.DEMO_PRESENCE_TENANTS ?? parsed?.DEMO_PRESENCE_TENANTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  console.log(`\nDEMO_PRESENCE_TENANTS = ${JSON.stringify(demoTenants)}`);
  console.log(`tenants with live orders = ${JSON.stringify(tenants)}`);

  for (const tenantId of tenants) {
    const fs = await prisma.fulfillmentSettings.findUnique({ where: { tenantId } });
    const staleSec = fs?.gpsStaleAfterSec ?? 180;
    const cutoff = new Date(Date.now() - staleSec * 1000);
    console.log(`\n=== tenant ${tenantId} ===`);
    console.log(
      `  settings: gpsStaleAfterSec=${staleSec} offerWindowSec=${fs?.offerWindowSec ?? 15} ` +
        `maxOfferRounds=${fs?.maxOfferRounds ?? 8} searchRadiusKm=${fs?.searchRadiusKm ?? 8} ` +
        `maxSearchRadiusKm=${fs?.maxSearchRadiusKm ?? 15} finishingSoonMinutes=${fs?.finishingSoonMinutes ?? 10}`,
    );

    const sessions = await prisma.courierOnlineSession.findMany({
      where: { tenantId, endTime: null },
      select: {
        driverId: true,
        availability: true,
        lastGpsAt: true,
        lastGpsLat: true,
        lastGpsLng: true,
        driver: { select: { name: true, status: true, vehicleType: true, throttledUntil: true } },
      },
      orderBy: { lastGpsAt: "desc" },
      take: 40,
    });
    const fresh = sessions.filter(
      (s) =>
        s.availability === "ONLINE" &&
        s.lastGpsAt != null &&
        s.lastGpsAt > cutoff &&
        s.lastGpsLat != null &&
        s.lastGpsLng != null &&
        s.driver?.status === "ACTIVE",
    );
    console.log(
      `  open sessions=${sessions.length}  ONLINE=${sessions.filter((s) => s.availability === "ONLINE").length}  ` +
        `dispatchable (ONLINE + ACTIVE + GPS < ${staleSec}s)=${fresh.length}`,
    );
    sessions.slice(0, 12).forEach((s) =>
      console.log(
        `    ${s.driver?.name ?? s.driverId}  ${s.availability}  driver=${s.driver?.status}  ` +
          `gps=${ago(s.lastGpsAt)}  at=${s.lastGpsLat},${s.lastGpsLng}`,
      ),
    );

    const offers = await prisma.dispatchOffer.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        orderId: true,
        driverId: true,
        status: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    console.log(`  last offers:`);
    offers.forEach((o) =>
      console.log(
        `    order=${o.orderId.slice(0, 8)} driver=${o.driverId.slice(0, 8)} ${o.status} ` +
          `made=${ago(o.createdAt)} expires=${o.expiresAt?.toISOString() ?? "-"}`,
      ),
    );
    if (offers.length === 0) console.log("    (none ever)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
