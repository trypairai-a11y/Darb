/**
 * backfill-revision-1.ts — data backfill for the client revision round
 * (Client-Requirements-and-Revision-Notes.docx).
 *
 * Three things, all idempotent:
 *
 *   #14  Every driver gets a Darb-issued driverCode ("DRB-0001"), assigned in
 *        createdAt order so the numbering is stable and reproducible. Finance
 *        searches remittances by this rather than by name.
 *
 *   #15/#27/#28  Sidra, Marina and Nakheel are one owner. Create the OwnerGroup
 *        and link those fleet partners to it, so one login reaches all three and
 *        their metrics can be reported combined.
 *
 *   #21  Classify every Company row as FLEET or VENDOR. Existing rows are all
 *        delivery companies, which is already the column default, so this only
 *        has to catch anything that looks merchant-side by name.
 *
 * Run: cd backend && npx tsx prisma/backfill-revision-1.ts
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

/** Fleets the client named as sharing one owner (Edit #27). */
const SIDRA_GROUP_FLEETS = ["Sidra", "Marina", "Nakheel"];

async function backfillDriverCodes(tenantId: string): Promise<number> {
  const drivers = await prisma.driver.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: { id: true, driverCode: true },
  });

  // Continue the sequence rather than restarting it, so re-running after new
  // drivers are added never renumbers anyone.
  const used = new Set(drivers.map((d) => d.driverCode).filter(Boolean) as string[]);
  let next = 1;
  let assigned = 0;

  for (const driver of drivers) {
    if (driver.driverCode) continue;
    let code = "";
    do {
      code = `DRB-${String(next).padStart(4, "0")}`;
      next += 1;
    } while (used.has(code));
    used.add(code);
    await prisma.driver.update({ where: { id: driver.id }, data: { driverCode: code } });
    assigned += 1;
  }
  return assigned;
}

async function backfillOwnerGroup(tenantId: string): Promise<number> {
  const group = await prisma.ownerGroup.upsert({
    where: { tenantId_name: { tenantId, name: "Sidra Group" } },
    update: {},
    create: { tenantId, name: "Sidra Group" },
  });

  const fleets = await prisma.fleetPartner.findMany({
    where: { tenantId },
    select: { id: true, name: true, ownerGroupId: true },
  });

  let linked = 0;
  const groupFleetIds: string[] = [];
  for (const fleet of fleets) {
    const belongs = SIDRA_GROUP_FLEETS.some((needle) =>
      fleet.name.toLowerCase().includes(needle.toLowerCase()),
    );
    if (!belongs) continue;
    groupFleetIds.push(fleet.id);
    if (fleet.ownerGroupId === group.id) continue;
    await prisma.fleetPartner.update({
      where: { id: fleet.id },
      data: { ownerGroupId: group.id },
    });
    linked += 1;
  }

  // The FLEET logins need the group too, or the company switcher never appears:
  // fleetContext() only widens scope for a user that carries an ownerGroupId.
  if (groupFleetIds.length > 0) {
    const { count } = await prisma.user.updateMany({
      where: { tenantId, role: "FLEET", fleetPartnerId: { in: groupFleetIds } },
      data: { ownerGroupId: group.id },
    });
    console.log(`  Sidra Group linked to ${count} fleet login(s)`);
  }
  return linked;
}

/** Merchant-side accounts, by name, so the toggle in #21 has both types to show. */
const VENDOR_NAME_HINTS = ["pharmacy", "center", "centre", "market", "restaurant", "store"];

async function backfillCompanyKind(tenantId: string): Promise<number> {
  const companies = await prisma.company.findMany({
    where: { tenantId },
    select: { id: true, name: true, kind: true },
  });
  let updated = 0;
  for (const company of companies) {
    const looksVendor = VENDOR_NAME_HINTS.some((hint) =>
      company.name.toLowerCase().includes(hint),
    );
    const kind = looksVendor ? "VENDOR" : "FLEET";
    if (company.kind === kind) continue;
    await prisma.company.update({ where: { id: company.id }, data: { kind } });
    updated += 1;
  }
  return updated;
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  if (tenants.length === 0) throw new Error("No tenant found.");

  for (const tenant of tenants) {
    console.log(`\nTenant: ${tenant.name}`);
    const codes = await backfillDriverCodes(tenant.id);
    console.log(`  driverCode assigned to ${codes} driver(s)`);
    const linked = await backfillOwnerGroup(tenant.id);
    console.log(`  Sidra Group linked to ${linked} fleet partner(s)`);
    const kinds = await backfillCompanyKind(tenant.id);
    console.log(`  Company.kind set on ${kinds} company row(s)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
