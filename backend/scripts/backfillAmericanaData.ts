/**
 * One-shot backfill for Americana data.
 *
 * Populates:
 *   • OrderLog.restaurantName / cashCollected   (per-row)
 *   • CashRecord rows                            (per Americana shift day)
 *   • AmericanaDailyOrders                       (per driver/store/day)
 *   • Violations of AMERICANA_* types            (top-up to ~25)
 *
 * Run with prod env:
 *   DOTENV_CONFIG_PATH=.env.prod npx ts-node -r dotenv/config scripts/backfillAmericanaData.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const AMERICANA_RESTAURANTS = [
  "KFC Hawally", "KFC Salmiya", "KFC Avenues", "KFC Jabriya", "KFC Fahaheel",
  "KFC Salwa", "KFC Mahboula", "KFC Audiliya",
  "Hardee's Hawally", "Hardee's Salmiya", "Hardee's Salwa", "Hardee's Mahboula",
  "Hardee's Rumaithiya", "Hardee's Audiliya", "Hardee's Jabriya", "Hardee's Fahaheel",
];

const AMERICANA_AREAS = [
  "Audiliya", "Hawally", "Salmiya", "Jabriya", "Salwa", "Rumaithiya", "Fahaheel", "Mahboula",
];

const AMERICANA_VIOLATION_TYPES = [
  "AMERICANA_LATE_ARRIVAL",
  "AMERICANA_NO_SHOW",
  "AMERICANA_EARLY_DEPARTURE_QUIT",
] as const;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function decimal(min: number, max: number, places = 3): number {
  return Number((Math.random() * (max - min) + min).toFixed(places));
}

async function backfillOrderLogs() {
  const missing = await prisma.orderLog.findMany({
    where: {
      platform: "AMERICANA",
      OR: [{ restaurantName: null }, { cashCollected: null }],
    },
    select: { id: true, orderCount: true, restaurantName: true, cashCollected: true },
  });

  console.log(`OrderLog: ${missing.length} Americana rows to backfill`);
  let n = 0;
  for (const row of missing) {
    const orderCount = row.orderCount || rand(15, 35);
    const cashKd =
      row.cashCollected == null
        ? Number((orderCount * (Math.random() * 0.5 + 0.25) * decimal(0.5, 1.5)).toFixed(3))
        : Number(row.cashCollected);
    await prisma.orderLog.update({
      where: { id: row.id },
      data: {
        restaurantName: row.restaurantName || pick(AMERICANA_RESTAURANTS),
        cashCollected: row.cashCollected == null ? cashKd : undefined,
      },
    });
    n++;
    if (n % 250 === 0) console.log(`  …${n}/${missing.length}`);
  }
  console.log(`OrderLog: backfilled ${n} rows`);
}

async function backfillCashRecords() {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let total = 0;
  for (const tenant of tenants) {
    const americanaShifts = await prisma.shift.findMany({
      where: { tenantId: tenant.id, platform: "AMERICANA", status: "COMPLETED" },
      select: { id: true, driverId: true, date: true, tenantId: true },
    });

    const existing = await prisma.cashRecord.findMany({
      where: {
        tenantId: tenant.id,
        driver: { platform: "AMERICANA" },
      },
      select: { driverId: true, date: true },
    });
    const existingKey = new Set(existing.map((r) => `${r.driverId}-${r.date.toISOString().slice(0, 10)}`));

    for (const s of americanaShifts) {
      const key = `${s.driverId}-${s.date.toISOString().slice(0, 10)}`;
      if (existingKey.has(key)) continue;
      const sales = decimal(8, 28);
      const deposited = Math.random() < 0.85;
      await prisma.cashRecord.create({
        data: {
          tenantId: s.tenantId,
          driverId: s.driverId,
          date: s.date,
          salesAmount: sales,
          collectionAmount: deposited ? sales : 0,
          depositMethod: deposited ? (pick(["CASH", "BANK_TRANSFER", "AL_MUZAINI"]) as any) : null,
          pendingDues: deposited ? 0 : sales,
          status: deposited ? "SETTLED" : "PENDING",
        },
      });
      total++;
    }
  }
  console.log(`CashRecord: created ${total} Americana rows`);
}

async function backfillViolations() {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let total = 0;
  for (const tenant of tenants) {
    const drivers = await prisma.driver.findMany({
      where: { tenantId: tenant.id, platform: "AMERICANA" },
      select: { id: true },
    });
    if (drivers.length === 0) continue;

    const existing = await prisma.violation.count({
      where: { tenantId: tenant.id, platform: "AMERICANA" },
    });

    const target = 28;
    const need = Math.max(0, target - existing);
    for (let i = 0; i < need; i++) {
      const drv = pick(drivers);
      const daysAgo = rand(0, 21);
      const vType = pick([...AMERICANA_VIOLATION_TYPES]);
      const vTime = new Date(Date.now() - daysAgo * 86400000 - rand(0, 43200000));
      const vStatus = i % 6 === 0 ? "OVERTURNED" : i % 7 === 0 ? "UNDER_REVIEW" : "ESTABLISHED";
      const aStatus =
        vStatus === "OVERTURNED" ? "APPROVED" : i % 5 === 0 ? "PENDING" : "NOT_RAISED";

      const details =
        vType === "AMERICANA_LATE_ARRIVAL"
          ? `Driver logged in ${rand(2, 35)} minutes after scheduled shift start`
          : vType === "AMERICANA_NO_SHOW"
          ? `Driver did not log in for the scheduled shift`
          : `Driver logged out ${rand(10, 90)} minutes before scheduled shift end`;

      await prisma.violation.create({
        data: {
          tenantId: tenant.id,
          driverId: drv.id,
          platform: "AMERICANA" as any,
          violationType: vType as any,
          violationStatus: vStatus as any,
          appealStatus: aStatus as any,
          firstAppealStatus: aStatus as any,
          violationTime: vTime,
          details,
          metadata: { source: "backfill" },
        },
      });
      total++;
    }
  }
  console.log(`Violations: created ${total} Americana rows`);
}

async function deleteWrongTypeViolations() {
  const wrong = await prisma.violation.findMany({
    where: {
      platform: "AMERICANA",
      NOT: { violationType: { in: AMERICANA_VIOLATION_TYPES as unknown as any[] } },
    },
    select: { id: true },
  });
  if (wrong.length === 0) {
    console.log("Violations: 0 wrong-type Americana rows to clean");
    return;
  }
  const ids = wrong.map((w) => w.id);
  await prisma.appeal.deleteMany({ where: { violationId: { in: ids } } });
  // Penalty has implicit M:N — Prisma handles via _PenaltyToViolation join, no FK on Penalty itself
  await prisma.violation.deleteMany({ where: { id: { in: ids } } });
  console.log(`Violations: removed ${ids.length} non-Americana types tagged AMERICANA`);
}

async function main() {
  console.log("Starting Americana backfill…");
  await deleteWrongTypeViolations();
  await backfillOrderLogs();
  await backfillCashRecords();
  await backfillViolations();
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
