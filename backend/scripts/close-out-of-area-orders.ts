/**
 * close-out-of-area-orders.ts — revision 24 (#4), one-off backlog clearance.
 *
 * The orders sitting in Ops → Orders → Needs review with "Dropoff is outside
 * every delivery zone" (Royal Pharmacy and others, late August through
 * September). They were refused at intake and saved as REJECTED rows, which
 * until revision 24 had no exit except fixing the pin: an order refused weeks
 * ago will never be delivered, so they piled up.
 *
 * Why they exist: before 5 October (revision 22) every drop outside a drawn
 * zone was refused, however close; since then only a drop more than 10 km
 * past the nearest zone is. This script prints the backlog grouped by shop,
 * intake source and month, so the cut-off is visible in the output.
 * From revision 24 the synchronous intakes (partner API, vendor portal, bulk
 * import, staff entry) refuse an out-of-area drop with 422 and save nothing,
 * so these no longer accumulate; only the Foodics / Shopify / Salla webhooks
 * still record one, because they cannot be answered there and then.
 *
 * What it does with each order: REJECTED → CANCELLED through the order FSM,
 * reason "Closed from review: dropoff outside the delivery area", actor
 * SYSTEM, no customer message, no money (a REJECTED order never had any).
 *
 * DRY RUN BY DEFAULT.
 *
 *   cd backend
 *   npx tsx scripts/close-out-of-area-orders.ts                       # dry run
 *   npx tsx scripts/close-out-of-area-orders.ts --tenant=<id>         # one tenant
 *   npx tsx scripts/close-out-of-area-orders.ts --vendor=<vendorId>   # one shop
 *   npx tsx scripts/close-out-of-area-orders.ts --include-no-coordinates
 *   npx tsx scripts/close-out-of-area-orders.ts --apply               # actually close them
 *
 * Reads DATABASE_URL from the environment (.env via dotenv).
 */
import "dotenv/config";
import { prisma } from "../src/config";
import { cancelOrder } from "../src/services/orderService";
import { OrderStateConflictError } from "../src/services/orderStateMachine";

const REASON = "Closed from review: dropoff outside the delivery area";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? "true" : hit.slice(eq + 1);
}

async function main() {
  const apply = arg("apply") === "true";
  const tenantId = arg("tenant");
  const vendorId = arg("vendor");
  const reasons = ["OUT_OF_ZONE_DROPOFF"];
  if (arg("include-no-coordinates") === "true") reasons.push("NO_COORDINATES");

  // eslint-disable-next-line no-restricted-syntax -- ops script, cross-tenant unless --tenant is given
  const rows = await prisma.deliveryOrder.findMany({
    where: {
      status: "REJECTED",
      rejectionReason: { in: reasons },
      ...(tenantId ? { tenantId } : {}),
      ...(vendorId ? { vendorId } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      orderNumber: true,
      source: true,
      rejectionReason: true,
      createdAt: true,
      vendor: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(
    `${apply ? "APPLYING" : "DRY RUN (add --apply to close them)"}: ${rows.length} open REJECTED order(s) for ${reasons.join(", ")}`,
  );
  if (rows.length === 0) return;

  // Where they came from: shop × source × month.
  const groups = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.vendor?.name ?? "?"} | ${r.source} | ${r.createdAt.toISOString().slice(0, 7)}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  console.log("\nBy shop | intake source | month:");
  for (const [key, n] of [...groups.entries()].sort()) console.log(`  ${String(n).padStart(4)}  ${key}`);
  console.log(
    `\nOldest ${rows[0].createdAt.toISOString().slice(0, 10)}, newest ${rows[rows.length - 1].createdAt.toISOString().slice(0, 10)}.\n`,
  );

  let closed = 0;
  let skipped = 0;
  for (const r of rows) {
    console.log(
      `  ${apply ? "close" : "would close"}  ${r.orderNumber.padEnd(18)} ${r.createdAt.toISOString().slice(0, 10)}  ${r.vendor?.name ?? ""}`,
    );
    if (!apply) continue;
    try {
      await cancelOrder({
        tenantId: r.tenantId,
        orderId: r.id,
        reason: REASON,
        actor: { type: "SYSTEM", name: "out-of-area backlog cleanup" },
        allowFrom: ["REJECTED"],
        notifyCustomer: false,
      });
      closed += 1;
    } catch (err) {
      skipped += 1;
      if (!(err instanceof OrderStateConflictError)) {
        console.warn(`    ${r.orderNumber}: ${(err as Error).message}`);
      }
    }
  }

  console.log(
    apply
      ? `\nDone: ${closed} closed, ${skipped} skipped (fixed or changed meanwhile).`
      : `\nWould close ${rows.length}. Nothing was written.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
