/**
 * Backfill Americana data: chains, stores, contracts, rates, store assignments,
 * daily orders for current + previous month, and a handful of violations so the
 * dashboard displays realistic numbers.
 *
 * Run:
 *   DATABASE_URL=... npx tsx scripts/backfill-americana.ts
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(a: T[]): T => a[rand(0, a.length - 1)];
const dec = (min: number, max: number, p = 3) =>
  parseFloat((Math.random() * (max - min) + min).toFixed(p));

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) throw new Error("No tenant found");
  const tid = tenant.id;
  console.log(`Tenant: ${tenant.name} (${tid})`);

  const adminUser = await prisma.user.findFirst({ where: { tenantId: tid, role: "ADMIN" } });
  const adminId = adminUser?.id ?? "system";

  const drivers = await prisma.driver.findMany({
    where: { tenantId: tid, platform: "AMERICANA" },
  });
  console.log(`Found ${drivers.length} Americana drivers`);

  // ─── 1. Chains ─────────────────────────────────────────────────────────────
  const chainSeeds = [
    { name: "KFC", slug: "kfc" },
    { name: "Pizza Hut", slug: "pizza-hut" },
    { name: "Hardees", slug: "hardees" },
    { name: "TGI Fridays", slug: "tgi-fridays" },
    { name: "Krispy Kreme", slug: "krispy-kreme" },
  ];
  const chains: any[] = [];
  for (const c of chainSeeds) {
    const existing = await prisma.americanaChain.findUnique({
      where: { tenantId_slug: { tenantId: tid, slug: c.slug } },
    });
    chains.push(
      existing ??
        (await prisma.americanaChain.create({
          data: { tenantId: tid, ...c, active: true },
        })),
    );
  }
  console.log(`Chains: ${chains.length}`);

  // ─── 2. Stores ─────────────────────────────────────────────────────────────
  const storeSeeds = [
    { chain: "kfc", name: "KFC Avenues", area: "Avenues" },
    { chain: "kfc", name: "KFC Salmiya", area: "Salmiya" },
    { chain: "kfc", name: "KFC Hawally", area: "Hawally" },
    { chain: "kfc", name: "KFC Audiliya", area: "Audiliya" },
    { chain: "pizza-hut", name: "Pizza Hut Hawally", area: "Hawally" },
    { chain: "pizza-hut", name: "Pizza Hut Jabriya", area: "Jabriya" },
    { chain: "pizza-hut", name: "Pizza Hut Mishref", area: "Mishref" },
    { chain: "hardees", name: "Hardees Salwa", area: "Salwa" },
    { chain: "hardees", name: "Hardees Mishref", area: "Mishref" },
    { chain: "hardees", name: "Hardees Salmiya", area: "Salmiya" },
    { chain: "tgi-fridays", name: "TGI Fridays Avenues", area: "Avenues" },
    { chain: "tgi-fridays", name: "TGI Fridays Marina", area: "Salmiya" },
    { chain: "krispy-kreme", name: "Krispy Kreme Avenues", area: "Avenues" },
  ];
  const stores: any[] = [];
  for (const s of storeSeeds) {
    const chain = chains.find((c) => c.slug === s.chain)!;
    const existing = await prisma.americanaStore.findUnique({
      where: { tenantId_name: { tenantId: tid, name: s.name } },
    });
    stores.push(
      existing ??
        (await prisma.americanaStore.create({
          data: {
            tenantId: tid,
            chainId: chain.id,
            name: s.name,
            area: s.area,
            managerName: pick(["Hassan A.", "Khaled M.", "Yousef R.", "Salem F.", "Omar K."]),
            managerPhone: `+965${rand(50000000, 99999999)}`,
            active: true,
            carDailyTarget: rand(20, 35),
            bikeDailyTarget: rand(15, 28),
            carMonthlyTarget: rand(550, 900),
            bikeMonthlyTarget: rand(400, 750),
          },
        })),
    );
  }
  console.log(`Stores: ${stores.length}`);

  // ─── 3. Contracts + chain rates ────────────────────────────────────────────
  const existingContracts = await prisma.americanaContract.count({ where: { tenantId: tid } });
  let contracts: any[] = await prisma.americanaContract.findMany({ where: { tenantId: tid } });
  if (existingContracts === 0) {
    const refs = ["AMR-2024-001", "AMR-2025-001", "AMR-2026-001"];
    for (let i = 0; i < refs.length; i++) {
      const year = 2024 + i;
      const c = await prisma.americanaContract.create({
        data: {
          tenantId: tid,
          contractRef: refs[i],
          signedDate: new Date(year, 0, rand(5, 25)),
          effectiveFrom: new Date(year, 0, 1),
          effectiveTo: i < refs.length - 1 ? new Date(year, 11, 31) : null,
          originalFileUrl: `/uploads/contracts/${refs[i]}.pdf`,
          ocrStatus: "DONE",
          ocrExtractedAt: new Date(year, 0, rand(5, 28)),
          ocrConfidence: dec(0.85, 0.99, 3),
          ocrDraftRates: {
            extractedRates: chains.map((ch) => ({
              chain: ch.name,
              car: dec(0.6, 1.2, 3),
              bike: dec(0.4, 0.9, 3),
            })),
          },
          notes:
            i === 0
              ? "Original master agreement"
              : i === 1
              ? "Annual renewal with updated bike rates"
              : "Active contract — current year",
        },
      });
      contracts.push(c);
    }
  }

  const existingRates = await prisma.americanaChainRate.count({ where: { tenantId: tid } });
  if (existingRates === 0) {
    for (const chain of chains) {
      for (const contract of contracts) {
        for (const vt of ["CAR", "BIKE"] as const) {
          await prisma.americanaChainRate.create({
            data: {
              tenantId: tid,
              chainId: chain.id,
              vehicleType: vt,
              ratePerOrder: vt === "CAR" ? dec(0.7, 1.2, 3) : dec(0.4, 0.9, 3),
              effectiveFrom: contract.effectiveFrom,
              effectiveTo: contract.effectiveTo,
              contractId: contract.id,
              createdBy: adminId,
            },
          });
        }
      }
    }
    console.log(`Rates: ${chains.length * contracts.length * 2}`);
  } else {
    console.log(`Rates already exist: ${existingRates}`);
  }

  // ─── 4. Store assignments (current month) ──────────────────────────────────
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  const driverStoreMap = new Map<string, any>();
  for (let i = 0; i < drivers.length; i++) {
    const driver = drivers[i];
    const store = stores[i % stores.length];
    driverStoreMap.set(driver.id, store);
    const existing = await prisma.americanaStoreAssignment.findFirst({
      where: { tenantId: tid, driverId: driver.id, month: monthStart },
    });
    if (!existing) {
      await prisma.americanaStoreAssignment.create({
        data: {
          tenantId: tid,
          driverId: driver.id,
          storeId: store.id,
          month: monthStart,
          startDate: monthStart,
          vehicleType: driver.vehicleType === "CAR" ? "CAR" : "BIKE",
          createdBy: "backfill",
        },
      });
    }
  }
  console.log(`Assignments: ${drivers.length}`);

  // ─── 5. Daily orders — last 6 months (always full month for demo) ─────────
  const buildDailyOrders = (year: number, month0: number, base: number) => {
    const dailyOrders: Record<string, number> = {};
    let total = 0;
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = String(d).padStart(2, "0");
      const isOff = Math.random() < 0.12;
      const orders = isOff ? 0 : Math.max(8, base + rand(-6, 8));
      dailyOrders[key] = orders;
      total += orders;
    }
    return { dailyOrders, total };
  };

  // Backfill 6 months: current month and 5 prior months so the chain-mix trend
  // chart fills out, with light month-over-month growth ending at current.
  const monthStarts: Date[] = [];
  for (let i = 5; i >= 0; i--) {
    monthStarts.push(new Date(today.getFullYear(), today.getMonth() - i, 1));
  }

  await prisma.americanaDailyOrders.deleteMany({
    where: { tenantId: tid, month: { in: monthStarts } },
  });

  for (const driver of drivers) {
    const store = driverStoreMap.get(driver.id);
    const chain = chains.find((c) => c.id === store.chainId);
    const position = driver.vehicleType === "CAR" ? "Car" : "Bike";
    const driverBase = rand(18, 26);

    for (let mi = 0; mi < monthStarts.length; mi++) {
      // Slight upward trend month over month: older months ~85% of latest
      const monthMultiplier = 0.85 + 0.03 * mi;
      const base = Math.round(driverBase * monthMultiplier);
      const { dailyOrders, total } = buildDailyOrders(
        monthStarts[mi].getFullYear(),
        monthStarts[mi].getMonth(),
        base,
      );
      await prisma.americanaDailyOrders.create({
        data: {
          tenantId: tid,
          driverId: driver.id,
          month: monthStarts[mi],
          chain: chain?.name ?? null,
          chainId: chain?.id ?? null,
          empId: driver.platformDriverId,
          storeName: store.name,
          storeId: store.id,
          company: "Al Hazm Express",
          position,
          dailyOrders,
          totalOrders: total,
          source: "EXCEL_IMPORT",
        },
      });
    }
  }
  console.log(`Daily orders: ${drivers.length * monthStarts.length} rows (6 months)`);

  // ─── 6. Violations + penalties + appeals (a handful) ───────────────────────
  const existingViolations = await prisma.violation.count({
    where: { tenantId: tid, platform: "AMERICANA" },
  });
  if (existingViolations === 0) {
    const types = [
      "LATE_PICKUP",
      "ORDER_REJECTION_TIMEOUT",
      "DROP_OFF_IN_ADVANCE",
      "ORDER_SLIGHTLY_LATE",
      "INVALID_DELIVERY_PHOTO",
    ] as const;
    for (let i = 0; i < 9; i++) {
      const driver = pick(drivers);
      const t = pick([...types]);
      const v = await prisma.violation.create({
        data: {
          tenantId: tid,
          driverId: driver.id,
          platform: "AMERICANA",
          violationType: t,
          violationStatus: i < 3 ? "UNDER_REVIEW" : "ESTABLISHED",
          appealStatus: i < 3 ? "PENDING" : i < 5 ? "REJECTED" : "NOT_RAISED",
          violationTime: new Date(Date.now() - rand(1, 25) * 86400000),
          details:
            t === "DROP_OFF_IN_ADVANCE"
              ? `Distance between drop-off and customer: ${rand(800, 4000)} meters`
              : t === "LATE_PICKUP"
              ? `Pickup delayed by ${rand(8, 22)} minutes after acceptance`
              : t === "ORDER_SLIGHTLY_LATE"
              ? `Delivery exceeded ETA by ${rand(6, 14)} minutes`
              : t === "ORDER_REJECTION_TIMEOUT"
              ? "Acceptance timer expired without action"
              : "Delivery photo failed AI vision check",
          taskId: `AM-${rand(100000, 999999)}`,
        },
      });
      if (i % 3 === 0) {
        await prisma.appeal.create({
          data: {
            tenantId: tid,
            violationId: v.id,
            appealStatus: "PENDING",
            channel: pick(["APP", "PHONE", "EMAIL"]),
            reason: "Traffic and customer rescheduling",
          },
        });
      }
    }
    console.log("Violations: 9");
  } else {
    console.log(`Violations exist: ${existingViolations}`);
  }

  await prisma.$disconnect();
  console.log("\nBackfill complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
