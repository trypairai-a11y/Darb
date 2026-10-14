/**
 * Revision 24 (#17) — one driver's cash ledger.
 *
 * Client note: "for the cash on hand of the drivers, we should be able to press
 * on the driver and see the actual ledger of each transaction, visible for the
 * admin and the delivery company portal."
 *
 * The cash-on-hand figure IS the driver's DRIVER_CASH account balance, so the
 * ledger behind it is that account's entries and nothing else: every COD
 * collection, tip, hand-in, company settlement and adjustment that moved it,
 * newest first, each with the running balance the posting left behind. Reading
 * the entries rather than re-deriving them from orders is what guarantees the
 * last running balance and the number on the Cash with companies screen are the
 * same number.
 *
 * DRIVER_CASH is asset-like (see walletService): a DEBIT raises what the driver
 * is holding, a CREDIT lowers it. The payload says "in" and "out" rather than
 * debit and credit so neither portal has to know the polarity table.
 *
 * Containment is the caller's job and is deliberately not optional: the staff
 * route passes no fleet, the fleet portal passes its own company and a driver
 * from another company answers exactly like a driver that does not exist.
 */
import { prisma } from "../../config";
import { driverOwnerKey, toKwdString } from "./walletService";

export interface DriverCashLedgerEntry {
  id: string;
  createdAt: Date;
  type: string;
  /** "IN" raised the cash the driver holds, "OUT" lowered it. */
  direction: "IN" | "OUT";
  amountKwd: string;
  runningBalanceKwd: string;
  orderId: string | null;
  orderNumber: string | null;
  remittanceId: string | null;
  /** How a hand-in was paid, when the line is one. */
  remittanceMethod: string | null;
  /** True when the delivery company cleared it out of its own deposit. */
  settledByCompany: boolean;
  memo: string | null;
}

export interface DriverCashLedger {
  driver: {
    id: string;
    name: string;
    driverCode: string | null;
    phone: string | null;
    fleetPartnerId: string | null;
    fleetPartnerName: string | null;
  };
  balanceKwd: string;
  data: DriverCashLedgerEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function getDriverCashLedger(opts: {
  tenantId: string;
  driverId: string;
  /** Set by the fleet portal: a driver outside this company reads as absent. */
  fleetPartnerId?: string;
  page: number;
  limit: number;
}): Promise<DriverCashLedger | null> {
  const { tenantId, driverId, fleetPartnerId, page, limit } = opts;

  const driver = await prisma.driver.findFirst({
    where: { id: driverId, tenantId, ...(fleetPartnerId ? { fleetPartnerId } : {}) },
    select: {
      id: true, name: true, driverCode: true, phone: true, fleetPartnerId: true,
      fleetPartner: { select: { name: true } },
    },
  });
  if (!driver) return null;

  const account = await prisma.walletAccount.findFirst({
    where: { tenantId, ownerType: "DRIVER_CASH", ownerKey: driverOwnerKey(driver.id) },
    select: { id: true, balanceKwd: true },
  });

  const driverOut = {
    id: driver.id,
    name: driver.name,
    driverCode: driver.driverCode,
    phone: driver.phone,
    fleetPartnerId: driver.fleetPartnerId,
    fleetPartnerName: driver.fleetPartner?.name ?? null,
  };

  // A driver who has never touched cash has no account yet. That is an empty
  // ledger at KD 0.000, not an error.
  if (!account) {
    return {
      driver: driverOut,
      balanceKwd: "0.000",
      data: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    };
  }

  const where = { tenantId, accountId: account.id };
  const [entries, total] = await Promise.all([
    prisma.walletEntry.findMany({
      where,
      // createdAt then id: two legs of one posting share a timestamp, and a
      // tie-break keeps page boundaries stable while the driver keeps working.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        transaction: { select: { type: true, memo: true, orderId: true, remittanceId: true } },
      },
    }),
    prisma.walletEntry.count({ where }),
  ]);

  const orderIds = [...new Set(entries.map((e) => e.transaction.orderId).filter((v): v is string => !!v))];
  const remittanceIds = [
    ...new Set(entries.map((e) => e.transaction.remittanceId).filter((v): v is string => !!v)),
  ];
  const [orders, remittances] = await Promise.all([
    orderIds.length
      ? prisma.deliveryOrder.findMany({
          where: { tenantId, id: { in: orderIds } },
          select: { id: true, orderNumber: true },
        })
      : Promise.resolve([] as { id: string; orderNumber: string }[]),
    remittanceIds.length
      ? prisma.remittance.findMany({
          where: { tenantId, id: { in: remittanceIds } },
          select: { id: true, method: true, fleetPartnerId: true },
        })
      : Promise.resolve([] as { id: string; method: string; fleetPartnerId: string | null }[]),
  ]);
  const orderNumberById = new Map(orders.map((o) => [o.id, o.orderNumber]));
  const remittanceById = new Map(remittances.map((r) => [r.id, r]));

  const data: DriverCashLedgerEntry[] = entries.map((e) => {
    const remittance = e.transaction.remittanceId ? remittanceById.get(e.transaction.remittanceId) : undefined;
    return {
      id: e.id,
      createdAt: e.createdAt,
      type: e.transaction.type,
      // DRIVER_CASH is asset-like: DEBIT raises the balance.
      direction: e.direction === "DEBIT" ? "IN" : "OUT",
      amountKwd: toKwdString(e.amountKwd),
      runningBalanceKwd: toKwdString(e.runningBalanceKwd),
      orderId: e.transaction.orderId,
      orderNumber: e.transaction.orderId ? orderNumberById.get(e.transaction.orderId) ?? null : null,
      remittanceId: e.transaction.remittanceId,
      remittanceMethod: remittance ? String(remittance.method) : null,
      settledByCompany: !!remittance?.fleetPartnerId,
      memo: e.transaction.memo,
    };
  });

  return {
    driver: driverOut,
    balanceKwd: toKwdString(account.balanceKwd),
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
