/**
 * One-off: replace all AMERICANA violations with mock data restricted to the
 * three attendance-only types (late login, no show, early logout). The
 * Americana violations page in the dashboard exposes only these three tabs.
 */
import { prisma } from "../src/config";

const TYPES = [
  "AMERICANA_LATE_ARRIVAL",
  "AMERICANA_NO_SHOW",
  "AMERICANA_EARLY_DEPARTURE_QUIT",
] as const;

const STATUSES = ["ESTABLISHED", "UNDER_REVIEW", "OVERTURNED", "EXPIRED"] as const;
const APPEALS = ["NOT_RAISED", "PENDING", "APPROVED", "REJECTED"] as const;

const rand = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1));
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

const detailsFor = (t: typeof TYPES[number]) => {
  if (t === "AMERICANA_LATE_ARRIVAL") return `Driver logged in ${rand(2, 35)} minutes after scheduled shift start.`;
  if (t === "AMERICANA_NO_SHOW") return `Driver did not log in for the scheduled shift.`;
  return `Driver logged out ${rand(10, 90)} minutes before scheduled shift end.`;
};

async function main() {
  const drivers = await prisma.driver.findMany({
    where: { platform: "AMERICANA" },
    select: { id: true, tenantId: true, name: true, platformDriverId: true, vehicleType: true },
  });
  if (drivers.length === 0) {
    console.log("No Americana drivers found");
    return;
  }

  const tenantIds = Array.from(new Set(drivers.map((d) => d.tenantId)));
  console.log(`Found ${drivers.length} Americana drivers across ${tenantIds.length} tenant(s)`);

  // Wipe existing Americana violations + their appeals/penalty links (per tenant).
  for (const tid of tenantIds) {
    const existing = await prisma.violation.findMany({
      where: { tenantId: tid, platform: "AMERICANA" },
      select: { id: true },
    });
    const ids = existing.map((v) => v.id);
    if (ids.length > 0) {
      await prisma.appeal.deleteMany({ where: { violationId: { in: ids } } });
      // Detach any penalty m2m references, then delete violations
      await prisma.$executeRawUnsafe(`DELETE FROM "_PenaltyToViolation" WHERE "B" = ANY($1::text[])`, ids);
      await prisma.violation.deleteMany({ where: { id: { in: ids } } });
    }
    console.log(`  tenant ${tid.slice(0, 8)}: removed ${ids.length} existing violations`);
  }

  // Create ~14 mock violations per tenant spread across the 3 types
  const now = Date.now();
  let total = 0;
  for (const tid of tenantIds) {
    const tenantDrivers = drivers.filter((d) => d.tenantId === tid);
    const count = Math.max(16, tenantDrivers.length * 2);
    for (let i = 0; i < count; i++) {
      const drv = pick(tenantDrivers);
      const vt = pick(TYPES);
      const status = i < count * 0.65 ? "ESTABLISHED" : pick(STATUSES);
      const appealS =
        status === "OVERTURNED" ? "APPROVED" : i % 4 === 0 ? pick(APPEALS) : "NOT_RAISED";
      await prisma.violation.create({
        data: {
          tenantId: tid,
          driverId: drv.id,
          platform: "AMERICANA",
          violationType: vt,
          violationStatus: status as any,
          appealStatus: appealS as any,
          firstAppealStatus: appealS as any,
          violationTime: new Date(now - rand(3600, 86400 * 25) * 1000),
          details: detailsFor(vt),
          taskId: null,
          metadata: {
            vehicleType: drv.vehicleType,
            platformDriverId: drv.platformDriverId,
          },
        },
      });
      total++;
    }
  }
  console.log(`Created ${total} Americana violations (3 attendance types only)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
