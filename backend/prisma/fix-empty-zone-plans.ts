/**
 * Give every empty by-zone DeliveryPlan a real rate card.
 *
 * A plan created and left blank reads as "no pair is serviceable", which took
 * a live pharmacy off dispatch entirely — 812 blank cells and an intra-zone
 * fee of KD 66 that was plainly somebody testing the input. pricingService now
 * treats a zero-rate plan as unconfigured and falls back to the tenant card,
 * so nothing is broken while these sit empty; this fills them so the plans
 * mean what their name says.
 *
 * The prices are NOT invented. Each cell is the tenant-wide rate the same
 * delivery would have cost with no plan at all:
 *
 *   cell(origin → dest) = FulfillmentSettings.intraZoneFeeKwd
 *                       + ZoneSurcharge[origin → dest].surchargeKwd
 *
 * so a merchant moved onto one of these plans pays exactly what they paid
 * before, and ops can then edit the grid from a sane baseline instead of a
 * blank sheet. Same for the flat fee: the plan takes the tenant's.
 *
 * Only touches ZONE plans holding ZERO rates. A plan somebody has actually
 * priced is never reshaped, and re-running changes nothing.
 *
 * Run: npx tsx prisma/fix-empty-zone-plans.ts [--check]
 */
import { PrismaClient, Prisma } from "../src/generated/prisma";

const prisma = new PrismaClient();

/** An intra-zone fee this far above the tenant's is a typo, not a price. */
const ABSURD_MULTIPLE = 10;

async function main() {
  const dryRun = process.argv.includes("--check");
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  for (const tenant of tenants) {
    const plans = await prisma.deliveryPlan.findMany({
      where: { tenantId: tenant.id, type: "ZONE" },
      select: {
        id: true,
        name: true,
        intraZoneFeeKwd: true,
        _count: { select: { zoneRates: true, vendors: true, branches: true } },
      },
    });
    const empty = plans.filter((p) => p._count.zoneRates === 0);
    if (empty.length === 0) continue;

    const settings = await prisma.fulfillmentSettings.findUnique({
      where: { tenantId: tenant.id },
      select: { intraZoneFeeKwd: true },
    });
    if (!settings) {
      console.warn(`${tenant.name}: no FulfillmentSettings, nothing to copy from — skipped`);
      continue;
    }
    const flat = new Prisma.Decimal(settings.intraZoneFeeKwd as unknown as Prisma.Decimal.Value);

    const surcharges = await prisma.zoneSurcharge.findMany({
      where: { tenantId: tenant.id },
      select: { originZoneId: true, destZoneId: true, surchargeKwd: true },
    });
    if (surcharges.length === 0) {
      console.warn(`${tenant.name}: no surcharge grid to copy — run seed-zones-kuwait.ts first`);
      continue;
    }

    console.log(`\n── ${tenant.name} ──`);
    console.log(`tenant card: flat ${flat.toFixed(3)} + ${surcharges.length} surcharge pairs`);

    for (const plan of empty) {
      const riders = plan._count.vendors + plan._count.branches;
      const current = plan.intraZoneFeeKwd
        ? new Prisma.Decimal(plan.intraZoneFeeKwd as unknown as Prisma.Decimal.Value)
        : null;
      // Null means "price same-zone off the grid diagonal", which is a real
      // choice. A number wildly above the tenant's is somebody's test input.
      const feeIsAbsurd = current != null && current.gt(flat.mul(ABSURD_MULTIPLE));
      const nextFee = current == null || feeIsAbsurd ? flat : current;

      console.log(
        `plan "${plan.name}": ${surcharges.length} cells` +
          (riders > 0 ? `, ${riders} merchant(s) riding` : ", nobody assigned") +
          (feeIsAbsurd ? `, flat fee ${current!.toFixed(3)} → ${flat.toFixed(3)}` : "") +
          (current == null ? `, flat fee → ${flat.toFixed(3)}` : ""),
      );
      if (dryRun) continue;

      await prisma.$transaction(async (tx) => {
        await tx.deliveryPlan.update({
          where: { id: plan.id },
          data: { intraZoneFeeKwd: nextFee },
        });
        await tx.deliveryPlanZoneRate.createMany({
          data: surcharges.map((s) => ({
            tenantId: tenant.id,
            planId: plan.id,
            originZoneId: s.originZoneId,
            destZoneId: s.destZoneId,
            feeKwd: flat.add(
              new Prisma.Decimal(s.surchargeKwd as unknown as Prisma.Decimal.Value),
            ),
          })),
          skipDuplicates: true,
        });
      });

      const after = await prisma.deliveryPlanZoneRate.count({ where: { planId: plan.id } });
      console.log(`  → ${after} rates written`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
