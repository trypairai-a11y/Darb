/**
 * reset-darb2-demo.ts — clear the Darb 2.0 OPERATIONAL data for one tenant so
 * prisma/seed-darb2-demo.ts can be re-run from a clean slate.
 *
 * Deliberately narrow. It removes only the PRD v3.0 order/money rows:
 *   DeliveryOrder + its OrderEvent / DispatchOffer / OrderRating / Refund /
 *   Incident rows, and the wallet ledger (WalletEntry, WalletTransaction,
 *   Remittance, VendorStatement, FleetPayoutStatement), then zeroes the
 *   cached WalletAccount balances.
 *
 * It never touches:
 *   - the legacy aggregator tables (OrderLog, TalabatDelivery, KpiRecord, ...)
 *   - orphan OrderEvent rows that predate the Darb 2.0 rebuild
 *   - the roster (zones, vendors, branches, fleets, drivers, users, API keys)
 *
 * Run: cd backend && npx tsx prisma/reset-darb2-demo.ts
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const tenant =
    (await prisma.tenant.findFirst({ where: { name: "Osama Fleet Management" } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) throw new Error("No tenant found.");
  const tid = tenant.id;
  console.log(`Resetting Darb 2.0 operational data for: ${tenant.name} (${tid})`);

  const orderIds = (
    await prisma.deliveryOrder.findMany({ where: { tenantId: tid }, select: { id: true } })
  ).map((o) => o.id);
  console.log(`  DeliveryOrders in scope: ${orderIds.length}`);

  const txIds = (
    await prisma.walletTransaction.findMany({ where: { tenantId: tid }, select: { id: true } })
  ).map((t) => t.id);

  // FK order: children first.
  const steps: [string, () => Promise<{ count: number }>][] = [
    ["OrderRating", () => prisma.orderRating.deleteMany({ where: { tenantId: tid } })],
    ["Refund", () => prisma.refund.deleteMany({ where: { tenantId: tid } })],
    ["Incident", () => prisma.incident.deleteMany({ where: { tenantId: tid } })],
    ["DispatchOffer", () => prisma.dispatchOffer.deleteMany({ where: { tenantId: tid } })],
    // Only events belonging to a Darb 2.0 order — orphan legacy rows stay put.
    ["OrderEvent", () => prisma.orderEvent.deleteMany({ where: { tenantId: tid, orderId: { in: orderIds } } })],
    ["WalletEntry", () => prisma.walletEntry.deleteMany({ where: { tenantId: tid } })],
    ["WalletTransaction", () => prisma.walletTransaction.deleteMany({ where: { tenantId: tid } })],
    ["Remittance", () => prisma.remittance.deleteMany({ where: { tenantId: tid } })],
    ["VendorStatement", () => prisma.vendorStatement.deleteMany({ where: { tenantId: tid } })],
    ["FleetPayoutStatement", () => prisma.fleetPayoutStatement.deleteMany({ where: { tenantId: tid } })],
    ["WalletReconciliationRun", () => prisma.walletReconciliationRun.deleteMany({ where: { tenantId: tid } })],
    ["DeliveryOrder", () => prisma.deliveryOrder.deleteMany({ where: { tenantId: tid } })],
  ];

  for (const [label, run] of steps) {
    const { count } = await run();
    console.log(`  deleted ${String(count).padStart(6)}  ${label}`);
  }

  const { count: zeroed } = await prisma.walletAccount.updateMany({
    where: { tenantId: tid },
    data: { balanceKwd: 0 },
  });
  console.log(`  zeroed  ${String(zeroed).padStart(6)}  WalletAccount balances`);
  console.log(`  (${txIds.length} wallet transactions were in scope)`);
  console.log("Reset complete. Re-run prisma/seed-darb2-demo.ts to repopulate.");
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
