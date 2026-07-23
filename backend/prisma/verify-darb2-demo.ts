/**
 * verify-darb2-demo.ts — integrity + coverage check for the Darb 2.0 demo data.
 *
 * Two things it proves:
 *   1. The double-entry ledger is genuinely sound (this is the real test that
 *      the seed drove the services rather than fabricating rows):
 *        - total DEBIT == total CREDIT
 *        - every transaction's own legs balance
 *        - each WalletAccount.balanceKwd == its latest entry's runningBalanceKwd
 *        - no orphan entries
 *   2. Every surface-backing table has rows.
 *
 * Exits non-zero if any invariant fails, so it can gate a deploy.
 *
 * Run: cd backend && npx tsx prisma/verify-darb2-demo.ts
 */
import { Prisma, PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const tenant =
    (await prisma.tenant.findFirst({ where: { name: "Osama Fleet Management" } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) throw new Error("No tenant found.");
  const tid = tenant.id;
  console.log(`Verifying Darb 2.0 demo data for: ${tenant.name}\n`);

  // ── 1. Ledger integrity ─────────────────────────────────────────────────
  console.log("Ledger integrity");

  const [dr] = await prisma.$queryRaw<{ s: Prisma.Decimal | null }[]>`
    SELECT COALESCE(SUM("amountKwd"), 0) AS s FROM "WalletEntry"
    WHERE "tenantId" = ${tid} AND direction = 'DEBIT'`;
  const [cr] = await prisma.$queryRaw<{ s: Prisma.Decimal | null }[]>`
    SELECT COALESCE(SUM("amountKwd"), 0) AS s FROM "WalletEntry"
    WHERE "tenantId" = ${tid} AND direction = 'CREDIT'`;
  const debits = new Prisma.Decimal(dr?.s ?? 0);
  const credits = new Prisma.Decimal(cr?.s ?? 0);
  check(debits.equals(credits), "total debits == total credits",
    `KD ${debits.toFixed(3)} vs ${credits.toFixed(3)}`);

  const unbalanced = await prisma.$queryRaw<{ id: string }[]>`
    SELECT t.id FROM "WalletTransaction" t
    JOIN "WalletEntry" e ON e."transactionId" = t.id
    WHERE t."tenantId" = ${tid}
    GROUP BY t.id
    HAVING SUM(CASE WHEN e.direction = 'DEBIT' THEN e."amountKwd" ELSE -e."amountKwd" END) <> 0`;
  check(unbalanced.length === 0, "every transaction's legs balance",
    `${unbalanced.length} unbalanced`);

  // The authoritative check, mirroring reconciliationService.checkCachedBalances:
  // the cached balance must equal the signed sum of the account's entries.
  // (Comparing against the LATEST entry's runningBalanceKwd would be wrong here —
  // backdating reorders createdAt relative to true insertion order, so "latest by
  // createdAt" is not necessarily the last row inserted.)
  const drifted = await prisma.$queryRaw<{ id: string }[]>`
    SELECT a.id FROM "WalletAccount" a
    JOIN "WalletEntry" e ON e."accountId" = a.id
    WHERE a."tenantId" = ${tid}
    GROUP BY a.id, a."balanceKwd", a."ownerType"
    HAVING a."balanceKwd" <> SUM(
      CASE WHEN a."ownerType" IN ('DRIVER_CASH', 'PLATFORM_CLEARING')
           THEN (CASE WHEN e.direction = 'DEBIT'  THEN e."amountKwd" ELSE -e."amountKwd" END)
           ELSE (CASE WHEN e.direction = 'CREDIT' THEN e."amountKwd" ELSE -e."amountKwd" END) END)`;
  check(drifted.length === 0, "cached balance == signed sum of entries",
    `${drifted.length} drifted`);

  // Presentation check: the ledger view orders by createdAt, so the running
  // balance column should climb monotonically in that same order.
  const nonMonotonic = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM (
      SELECT e."accountId",
             e."runningBalanceKwd" AS rb,
             LAG(e."runningBalanceKwd") OVER (PARTITION BY e."accountId" ORDER BY e."createdAt", e.id) AS prev_rb,
             e.direction, e."amountKwd", a."ownerType"
      FROM "WalletEntry" e JOIN "WalletAccount" a ON a.id = e."accountId"
      WHERE e."tenantId" = ${tid}
    ) s
    WHERE prev_rb IS NOT NULL AND rb <> prev_rb + (
      CASE WHEN "ownerType" IN ('DRIVER_CASH', 'PLATFORM_CLEARING')
           THEN (CASE WHEN direction = 'DEBIT'  THEN "amountKwd" ELSE -"amountKwd" END)
           ELSE (CASE WHEN direction = 'CREDIT' THEN "amountKwd" ELSE -"amountKwd" END) END)`;
  check(Number(nonMonotonic[0]?.n ?? 0) === 0, "running balance is monotonic in display order",
    `${Number(nonMonotonic[0]?.n ?? 0)} steps out of sequence`);

  const orphans = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM "WalletEntry" e
    LEFT JOIN "WalletTransaction" t ON t.id = e."transactionId"
    WHERE e."tenantId" = ${tid} AND t.id IS NULL`;
  check(Number(orphans[0]?.n ?? 0) === 0, "no orphan wallet entries");

  const lastRecon = await prisma.walletReconciliationRun.findFirst({
    where: { tenantId: tid }, orderBy: { runDate: "desc" },
  });
  check(lastRecon?.status === "OK", "latest reconciliation run is OK",
    lastRecon ? `${lastRecon.runDate.toISOString().slice(0, 10)} → ${lastRecon.status}` : "none found");

  // ── 2. Surface coverage ─────────────────────────────────────────────────
  console.log("\nSurface coverage");
  const counts: [string, number][] = [
    ["DeliveryOrder", await prisma.deliveryOrder.count({ where: { tenantId: tid } })],
    ["OrderEvent", await prisma.orderEvent.count({ where: { tenantId: tid } })],
    ["DispatchOffer", await prisma.dispatchOffer.count({ where: { tenantId: tid } })],
    ["OrderRating", await prisma.orderRating.count({ where: { tenantId: tid } })],
    ["Incident", await prisma.incident.count({ where: { tenantId: tid } })],
    ["WalletAccount", await prisma.walletAccount.count({ where: { tenantId: tid } })],
    ["WalletTransaction", await prisma.walletTransaction.count({ where: { tenantId: tid } })],
    ["WalletEntry", await prisma.walletEntry.count({ where: { tenantId: tid } })],
    ["Remittance", await prisma.remittance.count({ where: { tenantId: tid } })],
    ["Refund", await prisma.refund.count({ where: { tenantId: tid } })],
    ["VendorStatement", await prisma.vendorStatement.count({ where: { tenantId: tid } })],
    ["FleetPayoutStatement", await prisma.fleetPayoutStatement.count({ where: { tenantId: tid } })],
    ["Vendor", await prisma.vendor.count({ where: { tenantId: tid } })],
    ["VendorBranch", await prisma.vendorBranch.count({ where: { tenantId: tid } })],
    ["FleetPartner", await prisma.fleetPartner.count({ where: { tenantId: tid } })],
    ["ApiKey", await prisma.apiKey.count({ where: { tenantId: tid } })],
    ["DemandHeatmap", await prisma.demandHeatmap.count({ where: { tenantId: tid } })],
    ["DriverBatchHistory", await prisma.driverBatchHistory.count({ where: { tenantId: tid } })],
  ];
  for (const [name, n] of counts) check(n > 0, name.padEnd(22), String(n));

  // ── 3. Live control room ────────────────────────────────────────────────
  console.log("\nLive control room (/ops)");
  const inFlight = await prisma.deliveryOrder.groupBy({
    by: ["status"],
    where: { tenantId: tid, status: { in: ["CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED", "PICKED_UP"] } },
    _count: true,
  });
  const totalLive = inFlight.reduce((s, r) => s + r._count, 0);
  check(totalLive > 0, "orders in flight now",
    inFlight.map((r) => `${r.status}=${r._count}`).join(" "));

  const openSos = await prisma.incident.count({ where: { tenantId: tid, status: "OPEN" } });
  check(openSos > 0, "open incidents for the SOS badge", String(openSos));

  // Use the tenant's CONFIGURED staleness window, not a hardcoded 180s —
  // prisma/refresh-darb2-presence.ts raises it so a static demo stays live.
  const fs = await prisma.fulfillmentSettings.findUnique({
    where: { tenantId: tid }, select: { gpsStaleAfterSec: true },
  });
  const staleSec = fs?.gpsStaleAfterSec ?? 180;
  const onlineNow = await prisma.courierOnlineSession.count({
    where: { tenantId: tid, isOnline: true, lastGpsAt: { gte: new Date(Date.now() - staleSec * 1000) } },
  });
  check(onlineNow > 0, `drivers with fresh GPS (< ${staleSec}s)`, String(onlineNow));

  const jeopardy = await prisma.deliveryOrder.count({
    where: { tenantId: tid, status: { in: ["DISPATCHING", "ASSIGNED", "PICKED_UP"] }, slaDeadline: { lt: new Date() } },
  });
  check(jeopardy > 0, "orders past SLA for the jeopardy rail", String(jeopardy));

  // ── 4. History depth ────────────────────────────────────────────────────
  console.log("\nHistory depth");
  const oldest = await prisma.deliveryOrder.findFirst({
    where: { tenantId: tid }, orderBy: { createdAt: "asc" }, select: { createdAt: true },
  });
  const days = oldest ? Math.round((Date.now() - oldest.createdAt.getTime()) / 86_400_000) : 0;
  check(days >= 45, "history window (days)", String(days));

  const byStatus = await prisma.deliveryOrder.groupBy({ by: ["status"], where: { tenantId: tid }, _count: true });
  console.log(`  order mix: ${byStatus.map((r) => `${r.status}=${r._count}`).join(" ")}`);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(failures === 0 ? 0 : 1); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
