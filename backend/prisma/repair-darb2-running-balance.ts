/**
 * repair-darb2-running-balance.ts — re-sequence WalletEntry.runningBalanceKwd
 * into display order.
 *
 * Why this is needed: the seed produces history by calling the real services,
 * which stamp now(), and then backdates the rows. Backdating changes the
 * ORDER the ledger is displayed in (createdAt) without changing the order the
 * rows were INSERTED in — and runningBalanceKwd was computed at insert time.
 * The result is a ledger whose totals are correct but whose running-balance
 * column appears to jump around when sorted by date.
 *
 * runningBalanceKwd is a derived presentation column (the authoritative
 * balance is the signed sum of entries, which this script does not touch), so
 * recomputing it in createdAt order is safe and makes the finance view read
 * correctly. The final value per account is asserted to equal the cached
 * WalletAccount.balanceKwd, so a mistake here fails loudly.
 *
 * Run: cd backend && npx tsx prisma/repair-darb2-running-balance.ts
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const tenant =
    (await prisma.tenant.findFirst({ where: { name: "Osama Fleet Management" } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) throw new Error("No tenant found.");
  const tid = tenant.id;
  console.log(`Repairing running balances for: ${tenant.name}`);

  // Recompute in one pass with a window function, in display order.
  // ASSET_LIKE (DRIVER_CASH, PLATFORM_CLEARING): DEBIT increases.
  // Others (VENDOR_PAYABLE, PLATFORM_REVENUE):   CREDIT increases.
  const updated = await prisma.$executeRawUnsafe(`
    WITH ordered AS (
      SELECT e.id,
             SUM(
               CASE WHEN a."ownerType" IN ('DRIVER_CASH','PLATFORM_CLEARING')
                    THEN (CASE WHEN e.direction = 'DEBIT'  THEN e."amountKwd" ELSE -e."amountKwd" END)
                    ELSE (CASE WHEN e.direction = 'CREDIT' THEN e."amountKwd" ELSE -e."amountKwd" END) END
             ) OVER (PARTITION BY e."accountId" ORDER BY e."createdAt", e.id
                     ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
      FROM "WalletEntry" e
      JOIN "WalletAccount" a ON a.id = e."accountId"
      WHERE e."tenantId" = '${tid}'
    )
    UPDATE "WalletEntry" w
    SET "runningBalanceKwd" = o.running
    FROM ordered o
    WHERE w.id = o.id AND w."runningBalanceKwd" <> o.running
  `);
  console.log(`  rewrote ${updated} entry running balances`);

  // Assert the last entry per account now agrees with the cached balance.
  const mismatched = await prisma.$queryRawUnsafe<{ id: string; cached: string; last: string }[]>(`
    SELECT a.id, a."balanceKwd"::text AS cached, l."runningBalanceKwd"::text AS last
    FROM "WalletAccount" a
    JOIN LATERAL (
      SELECT e."runningBalanceKwd" FROM "WalletEntry" e
      WHERE e."accountId" = a.id ORDER BY e."createdAt" DESC, e.id DESC LIMIT 1
    ) l ON TRUE
    WHERE a."tenantId" = '${tid}' AND a."balanceKwd" <> l."runningBalanceKwd"
  `);

  if (mismatched.length > 0) {
    console.error(`  FAILED: ${mismatched.length} accounts still disagree with their final running balance`);
    console.error(mismatched.slice(0, 5));
    process.exitCode = 1;
    return;
  }
  console.log("  OK: every account's final running balance matches its cached balance");
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(process.exitCode ?? 0); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
