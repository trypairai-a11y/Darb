/**
 * fill-darb2-today.ts — put a believable day on every board.
 *
 * seed-darb2-today.ts fills in today's *completed* deliveries, one at a time
 * through the pooled connection, which takes long enough that a demo starting
 * in ten minutes will not get one. This does the same job in bulk, on the
 * unpooled connection, and covers the live states too: a merchant looking at
 * their order board should see work moving, not a column of empty boxes.
 *
 * Per merchant, for today:
 *   2 DISPATCHING   Incoming, waiting on a driver
 *   2 ASSIGNED      Driver en route to the shop
 *   2 PICKED_UP     On the way to the customer
 *   6 DELIVERED     Done today, with COD collected and a POD PIN
 *
 * Idempotent on externalRef: re-running replaces the same day's fill rather
 * than stacking a second one on top.
 *
 *   npx tsx prisma/fill-darb2-today.ts
 */
import { PrismaClient, Prisma } from "../src/generated/prisma";
import { randomBytes } from "crypto";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL } },
});

const REF_PREFIX = "FILL-";

const FIRST = ["Ahmad", "Yousef", "Fahad", "Noura", "Dana", "Hessa", "Abdullah", "Bader",
               "Maryam", "Faisal", "Latifa", "Salem", "Reem", "Khaled", "Shaikha"];
const LAST = ["Al Sabah", "Al Rashid", "Al Enezi", "Al Otaibi", "Al Ajmi", "Al Mutairi",
              "Al Khaled", "Al Hajri", "Al Dosari"];
const STREETS = [
  "Block 3, Street 12, House 45",
  "Block 7, Street 4, Building 22, Flat 6",
  "Block 1, Street 9, House 8",
  "Block 11, Street 2, Building 3, Flat 12",
  "Block 5, Street 21, House 30",
];

/** Deterministic-ish picker so a re-run reads the same, without Math.random. */
let tick = 0;
const pick = <T,>(arr: T[]): T => arr[(tick = (tick * 31 + 17) % 9973) % arr.length];
const between = (lo: number, hi: number) => lo + (((tick = (tick * 31 + 7) % 9973) % 1000) / 1000) * (hi - lo);

const money = (n: number) => new Prisma.Decimal(n.toFixed(3));
const token = () => randomBytes(16).toString("base64url");
const pin = () => String(1000 + ((tick = (tick * 31 + 3) % 9973) % 9000));

/** Kuwait is UTC+3; "today" must mean the operator's day, not the server's. */
function kuwaitDayStart(): Date {
  const now = new Date();
  const kw = new Date(now.getTime() + 3 * 3_600_000);
  kw.setUTCHours(0, 0, 0, 0);
  return new Date(kw.getTime() - 3 * 3_600_000);
}

async function main() {
  const tenant =
    (await prisma.tenant.findFirst({ where: { name: "Osama Fleet Management" } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) throw new Error("No tenant found.");
  const tid = tenant.id;

  const vendors = await prisma.vendor.findMany({
    where: { tenantId: tid, isActive: true, isPaused: false },
    select: {
      id: true, code: true,
      branches: {
        where: { isActive: true, zoneId: { not: null } },
        select: { id: true, zoneId: true, lat: true, lng: true },
      },
    },
  });
  const usable = vendors.filter((v) => v.branches.length > 0);

  const zones = await prisma.deliveryZone.findMany({
    where: { tenantId: tid, isActive: true },
    select: { id: true, centroidLat: true, centroidLng: true },
  });
  const drivers = await prisma.driver.findMany({
    where: { tenantId: tid, status: "ACTIVE" },
    select: { id: true },
  });
  if (usable.length === 0 || drivers.length === 0 || zones.length === 0) {
    throw new Error("Need active merchants, drivers and zones.");
  }

  // Replace any previous fill for today rather than stacking on it.
  const removed = await prisma.deliveryOrder.deleteMany({
    where: { tenantId: tid, externalRef: { startsWith: REF_PREFIX }, createdAt: { gte: kuwaitDayStart() } },
  });
  if (removed.count) console.log(`Cleared ${removed.count} rows from an earlier fill.`);

  const dayStart = kuwaitDayStart();
  const now = new Date();
  const rows: Prisma.DeliveryOrderCreateManyInput[] = [];

  // Order numbers continue each merchant's own sequence.
  const lastNums = new Map<string, number>();
  for (const v of usable) {
    const last = await prisma.deliveryOrder.findFirst({
      where: { tenantId: tid, vendorId: v.id },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });
    const n = last ? Number(last.orderNumber.split("-").pop()) : 0;
    lastNums.set(v.id, Number.isFinite(n) ? n : 0);
  }

  const PLAN: { status: string; count: number }[] = [
    { status: "DISPATCHING", count: 2 },
    { status: "ASSIGNED", count: 2 },
    { status: "PICKED_UP", count: 2 },
    { status: "DELIVERED", count: 6 },
  ];

  let seq = 0;
  for (const v of usable) {
    const branch = v.branches[0];
    for (const step of PLAN) {
      for (let i = 0; i < step.count; i++) {
        const num = (lastNums.get(v.id) ?? 0) + 1;
        lastNums.set(v.id, num);
        const dropZone = pick(zones);
        // Zones store their centre as two decimals, not a pair.
        const c: [number, number] = [
          dropZone.centroidLat ? Number(dropZone.centroidLat) : 29.3759,
          dropZone.centroidLng ? Number(dropZone.centroidLng) : 47.9774,
        ];
        const total = between(2.5, 34);
        const fee = pick([1.25, 1.5, 1.75, 2.0]);
        const cod = pick([true, true, false]);
        const driverId = pick(drivers).id;

        // Spread the day: delivered work earlier, live work near now.
        const live = step.status !== "DELIVERED";
        const spanMs = Math.max(60_000, now.getTime() - dayStart.getTime());
        const createdAt = live
          ? new Date(now.getTime() - between(3, 45) * 60_000)
          : new Date(dayStart.getTime() + between(0.05, 0.85) * spanMs);

        const assignedAt = step.status === "DISPATCHING" ? null : new Date(createdAt.getTime() + 4 * 60_000);
        const pickedUpAt =
          step.status === "PICKED_UP" || step.status === "DELIVERED"
            ? new Date(createdAt.getTime() + 9 * 60_000)
            : null;
        const deliveredAt = step.status === "DELIVERED" ? new Date(createdAt.getTime() + 26 * 60_000) : null;

        rows.push({
          tenantId: tid,
          orderNumber: `DRB-${v.code}-${String(num).padStart(4, "0")}`,
          source: "VENDOR_PORTAL",
          vendorId: v.id,
          branchId: branch.id,
          status: step.status as any,
          paymentMethod: cod ? "COD" : "PREPAID",
          orderTotalKwd: money(total),
          deliveryFeeKwd: money(fee),
          customerName: `${pick(FIRST)} ${pick(LAST)}`,
          customerPhone: `+9659${String(1000000 + ((tick = (tick * 31 + 11) % 9973) * 907) % 9000000)}`,
          dropoffAddress: `${pick(STREETS)}, ${""}`.trim().replace(/,$/, ""),
          dropoffLat: new Prisma.Decimal((c[0] + between(-0.006, 0.006)).toFixed(6)),
          dropoffLng: new Prisma.Decimal((c[1] + between(-0.006, 0.006)).toFixed(6)),
          pickupZoneId: branch.zoneId,
          dropoffZoneId: dropZone.id,
          driverId: step.status === "DISPATCHING" ? null : driverId,
          offerRound: step.status === "DISPATCHING" ? 1 : 1,
          redispatchAttempts: 0,
          requiresCarOnly: false,
          podPin: pin(),
          codCollectedKwd: step.status === "DELIVERED" && cod ? money(total) : null,
          slaDeadline: new Date(createdAt.getTime() + 45 * 60_000),
          trackingToken: token(),
          externalRef: `${REF_PREFIX}${dayStart.toISOString().slice(0, 10)}-${++seq}`,
          assignedAt,
          pickedUpAt,
          deliveredAt,
          createdAt,
          updatedAt: deliveredAt ?? pickedUpAt ?? assignedAt ?? createdAt,
        });
      }
    }
  }

  const made = await prisma.deliveryOrder.createMany({ data: rows, skipDuplicates: true });
  console.log(`Created ${made.count} orders across ${usable.length} merchants.`);

  const counts = await prisma.deliveryOrder.groupBy({
    by: ["status"],
    where: { tenantId: tid, createdAt: { gte: dayStart } },
    _count: true,
  });
  for (const c of counts) console.log(`  ${c.status}: ${c._count}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
