/**
 * Fleet cash deposits (revision 14).
 *
 * What this replaces: nothing, which was the problem. A driver collects COD all
 * day and it sits on DRIVER_CASH until the driver personally carries it to
 * Darb's cash desk. In practice the driver hands it to their own supervisor and
 * the delivery company settles with Darb in one lump, so every driver's
 * cash-on-hand read as outstanding forever and the only way to clear it was for
 * Darb to record hand-ins that never physically happened.
 *
 * The first design was a per-deposit allocation: the company submits an envelope
 * with a per-driver split, and Darb's confirmation clears those drivers. It was
 * rejected for a good reason. It makes every driver's balance wait on Darb's
 * back office, so somebody who paid on Monday still reads as owing on Wednesday
 * because an accountant has not counted an envelope.
 *
 * What is built instead is a PREPAID account, which is the vendor wallet
 * relationship inverted:
 *
 *   deposit  — the company pays Darb, an accountant confirms receipt, and only
 *              then is FLEET_CASH credited. Confirm before credit, exactly as
 *              topUpService does it, down to the repair branch.
 *   settle   — with a confirmed balance in hand the company clears its own
 *              drivers instantly, no Darb involvement. There is nothing left to
 *              verify: the money has been Darb's since the confirmation.
 *
 * Two things this deliberately does NOT have, both of which a merchant top-up
 * does. There is no payment gateway and no public token: a fleet deposit is an
 * envelope or a bank transfer between two companies that both already have
 * logins, not a checkout link a stranger opens on a phone. Inventing a
 * /pay/{token} here would be a public surface with nothing to do.
 */
import { randomBytes } from "crypto";
import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";
import { publishEvent } from "../eventBus";
import {
  ensureAccount,
  fleetOwnerKey,
  postLedgerTransaction,
  toKwdString,
  WalletError,
} from "./walletService";

/** Validation failure — routes map instances to HTTP 400. */
export class FleetCashError extends WalletError {}

/** A conflict rather than a validation failure — routes map these to 409. */
export class FleetCashConflict extends WalletError {}

export type FleetDepositMethod = "CASH" | "BANK_TRANSFER" | "AL_MUZAINI";

const DEPOSIT_METHODS: readonly FleetDepositMethod[] = ["CASH", "BANK_TRANSFER", "AL_MUZAINI"];

export function isFleetDepositMethod(value: unknown): value is FleetDepositMethod {
  return typeof value === "string" && (DEPOSIT_METHODS as readonly string[]).includes(value);
}

/**
 * How many drivers one settlement call may clear.
 *
 * Each line is a Remittance create plus a ledger posting inside one interactive
 * transaction, and the whole thing has to finish inside a 60s serverless
 * function. A company with more than 100 drivers owing cash settles twice.
 */
export const MAX_SETTLEMENT_LINES = 100;

/** A single deposit is capped for the same reason a top-up is: a typo. */
const MAX_DEPOSIT_KWD = new Prisma.Decimal(50_000);

/** Short reference a human can read down a phone line. */
function generateReference(): string {
  return `DEP-${randomBytes(3).toString("hex").toUpperCase()}`;
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export interface FleetCashDriverRow {
  driverId: string;
  name: string;
  driverCode: string | null;
  phone: string | null;
  cashOnHandKwd: string;
}

export interface FleetCashSummary {
  /** Deposited with Darb and not yet spent. Never negative. */
  balanceKwd: string;
  /** What the company's drivers are still holding, i.e. what it has to cover. */
  driverCashOutstandingKwd: string;
  /** Submitted and waiting on a Darb accountant. Credits nothing yet. */
  pendingDepositsKwd: string;
  drivers: FleetCashDriverRow[];
}

/**
 * Cash-on-hand for a whole roster in ONE query.
 *
 * A query per driver is what this replaces before anybody writes it: the fleet
 * roster and the settle screen both want every driver's balance at once, and a
 * company with 80 drivers would otherwise open 80 connections on a serverless
 * host. Exported because the roster endpoint wants the same map.
 */
export async function driverCashBalances(
  tenantId: string,
  driverIds: string[],
): Promise<Map<string, Prisma.Decimal>> {
  const out = new Map<string, Prisma.Decimal>();
  if (driverIds.length === 0) return out;

  const accounts = await prisma.walletAccount.findMany({
    where: {
      tenantId,
      ownerType: "DRIVER_CASH",
      ownerKey: { in: driverIds.map((id) => `DRIVER:${id}`) },
    },
    select: { ownerKey: true, balanceKwd: true },
  });
  for (const account of accounts) {
    out.set(account.ownerKey.slice("DRIVER:".length), account.balanceKwd);
  }
  return out;
}

/** The company's own cash position: what it has with Darb, what it still owes. */
export async function getFleetCashSummary(
  tenantId: string,
  fleetPartnerId: string,
): Promise<FleetCashSummary> {
  const [account, drivers, pending] = await Promise.all([
    prisma.walletAccount.findFirst({
      where: { tenantId, ownerKey: fleetOwnerKey(fleetPartnerId) },
      select: { balanceKwd: true },
    }),
    prisma.driver.findMany({
      where: { tenantId, fleetPartnerId },
      select: { id: true, name: true, driverCode: true, phone: true },
      orderBy: { name: "asc" },
    }),
    prisma.fleetCashDeposit.aggregate({
      where: { tenantId, fleetPartnerId, status: "PENDING" },
      _sum: { amountKwd: true },
    }),
  ]);

  const balances = await driverCashBalances(
    tenantId,
    drivers.map((d) => d.id),
  );

  let outstanding = new Prisma.Decimal(0);
  const rows: FleetCashDriverRow[] = [];
  for (const driver of drivers) {
    const cash = balances.get(driver.id) ?? new Prisma.Decimal(0);
    // A driver whose account somehow reads negative owes nothing, and showing
    // it as a negative to settle would invite an entry that makes it worse.
    if (cash.lessThanOrEqualTo(0)) continue;
    outstanding = outstanding.plus(cash);
    rows.push({
      driverId: driver.id,
      name: driver.name,
      driverCode: driver.driverCode,
      phone: driver.phone,
      cashOnHandKwd: cash.toFixed(3),
    });
  }
  // Biggest debt first: that is the one the company wants to clear.
  rows.sort((a, b) => Number(b.cashOnHandKwd) - Number(a.cashOnHandKwd));

  return {
    balanceKwd: toKwdString(account?.balanceKwd ?? 0),
    driverCashOutstandingKwd: outstanding.toFixed(3),
    pendingDepositsKwd: toKwdString(pending._sum.amountKwd ?? 0),
    drivers: rows,
  };
}

// ─── Deposits ────────────────────────────────────────────────────────────────

export interface FleetDepositRow {
  id: string;
  fleetPartnerId: string;
  fleetPartnerName?: string;
  amountKwd: string;
  method: string;
  reference: string;
  note: string | null;
  receiptUrl: string | null;
  status: string;
  rejectReason: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
}

function serializeDeposit(row: {
  id: string;
  fleetPartnerId: string;
  amountKwd: Prisma.Decimal;
  method: string;
  reference: string;
  note: string | null;
  receiptUrl: string | null;
  status: string;
  rejectReason: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  fleetPartner?: { name: string } | null;
}): FleetDepositRow {
  return {
    id: row.id,
    fleetPartnerId: row.fleetPartnerId,
    ...(row.fleetPartner ? { fleetPartnerName: row.fleetPartner.name } : {}),
    amountKwd: toKwdString(row.amountKwd),
    method: row.method,
    reference: row.reference,
    note: row.note,
    receiptUrl: row.receiptUrl,
    status: row.status,
    rejectReason: row.rejectReason,
    confirmedAt: row.confirmedAt,
    createdAt: row.createdAt,
  };
}

/**
 * Record the intent to pay. Credits NOTHING — an accountant confirming receipt
 * is the only thing that moves the balance, which is the whole point of the
 * two-step and the reason the portal says so on the form.
 */
export async function createFleetDeposit(opts: {
  tenantId: string;
  fleetPartnerId: string;
  amountKwd: string | number;
  method: FleetDepositMethod;
  note?: string | null;
  receiptUrl?: string | null;
  requestedById?: string | null;
}): Promise<FleetDepositRow> {
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(opts.amountKwd);
  } catch {
    throw new FleetCashError("Amount must be a number");
  }
  if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
    throw new FleetCashError("Amount must be greater than zero");
  }
  if (amount.greaterThan(MAX_DEPOSIT_KWD)) {
    throw new FleetCashError("Amount is too large. Contact Darb to settle a sum this size.");
  }
  if (!isFleetDepositMethod(opts.method)) {
    throw new FleetCashError("Method must be CASH, BANK_TRANSFER or AL_MUZAINI");
  }

  const row = await prisma.fleetCashDeposit.create({
    data: {
      tenantId: opts.tenantId,
      fleetPartnerId: opts.fleetPartnerId,
      requestedById: opts.requestedById ?? null,
      amountKwd: amount.toDecimalPlaces(3),
      method: opts.method,
      reference: generateReference(),
      note: opts.note?.trim() || null,
      receiptUrl: opts.receiptUrl ?? null,
    },
  });

  publishEvent({
    type: "fleet.deposit.submitted",
    tenantId: opts.tenantId,
    payload: {
      depositId: row.id,
      fleetPartnerId: opts.fleetPartnerId,
      amountKwd: toKwdString(row.amountKwd),
      reference: row.reference,
      method: row.method,
    },
    timestamp: new Date().toISOString(),
  }).catch(() => {});

  return serializeDeposit(row);
}

/** The company withdrawing its own submission. PENDING only, never a confirmed one. */
export async function cancelFleetDeposit(
  tenantId: string,
  fleetPartnerId: string,
  depositId: string,
): Promise<boolean> {
  const result = await prisma.fleetCashDeposit.updateMany({
    where: { id: depositId, tenantId, fleetPartnerId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  return result.count > 0;
}

/**
 * Confirm the money arrived and credit the company's account.
 *
 * CREDIT on FLEET_CASH raises the balance, which is what a liability account
 * looks like when we start holding somebody's money; PLATFORM_CLEARING takes
 * the matching debit because the cash is now in Darb's hands.
 *
 * The claim and the credit are ONE transaction, and the repair branch below is
 * not defensive decoration — it is the bug `confirmTopUp` shipped with. Flip
 * the row, die before posting (a cold lambda, a pooler blip), and you have a
 * deposit reading CONFIRMED with no money in the account, while every retry
 * takes the already-confirmed path and posts nothing. Nobody's nightly
 * reconciliation looks for that shape.
 */
export async function confirmFleetDeposit(opts: {
  tenantId: string;
  depositId: string;
  actorId: string;
}): Promise<{ ok: boolean; alreadyConfirmed: boolean; balanceKwd: string }> {
  const postCredit = async (
    tx: Prisma.TransactionClient,
    row: { id: string; fleetPartnerId: string; amountKwd: Prisma.Decimal; reference: string },
  ) => {
    const fleetAccount = await ensureAccount(tx, opts.tenantId, "FLEET_CASH", {
      fleetPartnerId: row.fleetPartnerId,
    });
    const clearing = await ensureAccount(tx, opts.tenantId, "PLATFORM_CLEARING");
    const posted = await postLedgerTransaction(tx, {
      tenantId: opts.tenantId,
      type: "FLEET_DEPOSIT",
      idempotencyKey: `fleet-deposit:${row.id}`,
      memo: `Fleet cash deposit ${row.reference}`,
      createdById: opts.actorId,
      legs: [
        {
          accountId: fleetAccount.id,
          ownerType: "FLEET_CASH",
          direction: "CREDIT",
          amountKwd: row.amountKwd,
        },
        {
          accountId: clearing.id,
          ownerType: "PLATFORM_CLEARING",
          direction: "DEBIT",
          amountKwd: row.amountKwd,
        },
      ],
    });
    return posted?.balances[fleetAccount.id] ?? fleetAccount.balanceKwd;
  };

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.fleetCashDeposit.updateMany({
      where: { id: opts.depositId, tenantId: opts.tenantId, status: "PENDING" },
      data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: opts.actorId },
    });

    const row = await tx.fleetCashDeposit.findFirst({
      where: { id: opts.depositId, tenantId: opts.tenantId },
      select: {
        id: true,
        fleetPartnerId: true,
        amountKwd: true,
        reference: true,
        status: true,
      },
    });
    if (!row) return null;

    if (claimed.count === 0) {
      // Somebody else claimed it, or it was rejected or withdrawn. Only a row
      // that genuinely reads CONFIRMED is worth repairing.
      if (row.status !== "CONFIRMED") return { row, ok: false, alreadyConfirmed: false, balance: null };
      // Checked by key rather than caught as a unique violation: a P2002 inside
      // an interactive transaction aborts the whole transaction.
      const posted = await tx.walletTransaction.findFirst({
        where: { tenantId: opts.tenantId, idempotencyKey: `fleet-deposit:${row.id}` },
        select: { id: true },
      });
      const balance = posted ? null : await postCredit(tx, row);
      return { row, ok: true, alreadyConfirmed: true, balance };
    }

    const balance = await postCredit(tx, row);
    return { row, ok: true, alreadyConfirmed: false, balance };
  });

  if (!result) throw new FleetCashError("Deposit not found");
  if (!result.ok) {
    throw new FleetCashConflict(
      `This deposit is already ${result.row.status.toLowerCase()} and cannot be confirmed`,
    );
  }

  const balanceKwd =
    result.balance !== null
      ? toKwdString(result.balance)
      : await currentFleetBalance(opts.tenantId, result.row.fleetPartnerId);

  if (!result.alreadyConfirmed) {
    publishEvent({
      type: "fleet.deposit.confirmed",
      tenantId: opts.tenantId,
      payload: {
        depositId: result.row.id,
        fleetPartnerId: result.row.fleetPartnerId,
        amountKwd: toKwdString(result.row.amountKwd),
        reference: result.row.reference,
        balanceKwd,
      },
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }

  return { ok: true, alreadyConfirmed: result.alreadyConfirmed, balanceKwd };
}

async function currentFleetBalance(tenantId: string, fleetPartnerId: string): Promise<string> {
  const account = await prisma.walletAccount.findFirst({
    where: { tenantId, ownerKey: fleetOwnerKey(fleetPartnerId) },
    select: { balanceKwd: true },
  });
  return toKwdString(account?.balanceKwd ?? 0);
}

/**
 * Refuse a deposit. Posts nothing, and requires a reason: a company told only
 * that its money was refused has to ring somebody to find out why, which is the
 * same argument that made a fleet issue need a note to resolve.
 */
export async function rejectFleetDeposit(opts: {
  tenantId: string;
  depositId: string;
  actorId: string;
  reason: string;
}): Promise<boolean> {
  const reason = opts.reason?.trim();
  if (!reason) throw new FleetCashError("A reason is required to reject a deposit");

  const result = await prisma.fleetCashDeposit.updateMany({
    where: { id: opts.depositId, tenantId: opts.tenantId, status: "PENDING" },
    data: { status: "REJECTED", rejectReason: reason, confirmedById: opts.actorId },
  });
  if (result.count === 0) return false;

  const row = await prisma.fleetCashDeposit.findFirst({
    where: { id: opts.depositId, tenantId: opts.tenantId },
    select: { id: true, fleetPartnerId: true, amountKwd: true, reference: true },
  });
  if (row) {
    publishEvent({
      type: "fleet.deposit.rejected",
      tenantId: opts.tenantId,
      payload: {
        depositId: row.id,
        fleetPartnerId: row.fleetPartnerId,
        amountKwd: toKwdString(row.amountKwd),
        reference: row.reference,
        reason,
      },
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }
  return true;
}

export async function listFleetDeposits(opts: {
  tenantId: string;
  fleetPartnerIds?: string[];
  status?: string;
  take?: number;
  skip?: number;
  withPartnerName?: boolean;
}): Promise<{ data: FleetDepositRow[]; total: number }> {
  const where: Prisma.FleetCashDepositWhereInput = {
    tenantId: opts.tenantId,
    ...(opts.fleetPartnerIds ? { fleetPartnerId: { in: opts.fleetPartnerIds } } : {}),
    ...(opts.status ? { status: opts.status as never } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.fleetCashDeposit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts.take ?? 50,
      skip: opts.skip ?? 0,
      ...(opts.withPartnerName ? { include: { fleetPartner: { select: { name: true } } } } : {}),
    }),
    prisma.fleetCashDeposit.count({ where }),
  ]);
  return { data: rows.map(serializeDeposit), total };
}

// ─── Settlement ──────────────────────────────────────────────────────────────

export interface SettlementLineInput {
  driverId: string;
  amountKwd: string | number;
}

export interface SettlementResult {
  totalKwd: string;
  balanceKwd: string;
  lines: Array<{ driverId: string; driverName: string; amountKwd: string; remittanceId: string }>;
}

/**
 * Clear driver cash out of the company's deposited balance.
 *
 * Instant and unilateral, which is the point of the prepaid model: the money
 * has been Darb's since the deposit was confirmed, so there is nothing left for
 * Darb to approve. What that costs is real and accepted — a company can mark a
 * driver settled for more than the driver actually handed over, and that is the
 * company's loss out of its own balance, not Darb's.
 *
 * Every line writes a Remittance rather than a row in some new table. That keeps
 * /cash-desk/history, GET /api/wallets/remittances, the driver's own history and
 * the nightly reconciliation working untouched, and a driver's cash-clearing
 * history stays ONE list whoever settled it.
 *
 * ALL OR NOTHING. One bad line creates nothing, the same rule the vendor bulk
 * import follows: a half-applied settlement is the single outcome neither side
 * can reconcile afterwards.
 */
export async function settleDriverCash(opts: {
  tenantId: string;
  fleetPartnerId: string;
  lines: SettlementLineInput[];
  actorId: string;
  note?: string | null;
}): Promise<SettlementResult> {
  if (!Array.isArray(opts.lines) || opts.lines.length === 0) {
    throw new FleetCashError("Select at least one driver to settle");
  }
  if (opts.lines.length > MAX_SETTLEMENT_LINES) {
    throw new FleetCashError(
      `Settle at most ${MAX_SETTLEMENT_LINES} drivers at a time. Split the list and run it twice.`,
    );
  }

  // Parse and total first, so a malformed amount fails before anything is read.
  const parsed: Array<{ driverId: string; amount: Prisma.Decimal }> = [];
  const seen = new Set<string>();
  let total = new Prisma.Decimal(0);
  for (const line of opts.lines) {
    if (!line?.driverId || typeof line.driverId !== "string") {
      throw new FleetCashError("Every line needs a driver");
    }
    if (seen.has(line.driverId)) {
      // Two lines for one driver is a UI bug that would silently double-settle.
      throw new FleetCashError("The same driver appears twice in this settlement");
    }
    seen.add(line.driverId);

    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(line.amountKwd);
    } catch {
      throw new FleetCashError("Every amount must be a number");
    }
    if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
      throw new FleetCashError("Every amount must be greater than zero");
    }
    amount = amount.toDecimalPlaces(3);
    parsed.push({ driverId: line.driverId, amount });
    total = total.plus(amount);
  }

  const result = await prisma.$transaction(async (tx) => {
    const fleetAccount = await ensureAccount(tx, opts.tenantId, "FLEET_CASH", {
      fleetPartnerId: opts.fleetPartnerId,
    });

    /**
     * Claim the company's balance under a row lock rather than reading it.
     *
     * Same discipline, and the same hard-won reason, as the driver-side guard in
     * remittanceService: the atomic decrement inside postLedgerTransaction
     * serializes writers but has no non-negative constraint, so two settlements
     * of KD 400 against a KD 500 balance would both pass a read and both post,
     * leaving the account at -300. A guarded updateMany takes the lock,
     * evaluates the condition under it, and count 0 means somebody else won.
     * The lock is held to the end of this transaction, so the loser waits and
     * then re-reads a balance that is genuinely short.
     */
    const held = await tx.walletAccount.updateMany({
      where: { id: fleetAccount.id, balanceKwd: { gte: total } },
      data: { updatedAt: new Date() },
    });
    if (held.count === 0) {
      throw new FleetCashError(
        `This settlement is KD ${total.toFixed(3)} but the deposit balance is KD ${toKwdString(
          fleetAccount.balanceKwd,
        )}. Deposit the difference first.`,
      );
    }

    // Every driver must be this company's. A settle call naming somebody else's
    // driver is either a stale screen or an attempt to spend a deposit on a
    // roster the payer has nothing to do with.
    const drivers = await tx.driver.findMany({
      where: {
        tenantId: opts.tenantId,
        fleetPartnerId: opts.fleetPartnerId,
        id: { in: parsed.map((l) => l.driverId) },
      },
      select: { id: true, name: true },
    });
    if (drivers.length !== parsed.length) {
      throw new FleetCashError("One of these drivers is not on your roster");
    }
    const nameById = new Map(drivers.map((d) => [d.id, d.name]));

    const lines: SettlementResult["lines"] = [];
    let balance = fleetAccount.balanceKwd;

    for (const line of parsed) {
      const driverAccount = await ensureAccount(tx, opts.tenantId, "DRIVER_CASH", {
        driverId: line.driverId,
      });

      // The driver-side guard, identical to a cash-desk hand-in: a company
      // cannot clear more than the driver is actually carrying, or DRIVER_CASH
      // goes negative and the driver is owed money they never handed over.
      const claimed = await tx.walletAccount.updateMany({
        where: { id: driverAccount.id, balanceKwd: { gte: line.amount } },
        data: { updatedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new FleetCashError(
          `${nameById.get(line.driverId) ?? "This driver"} is carrying KD ${toKwdString(
            driverAccount.balanceKwd,
          )}, less than the KD ${line.amount.toFixed(3)} on this line. Nothing was settled.`,
        );
      }

      const remittance = await tx.remittance.create({
        data: {
          tenantId: opts.tenantId,
          driverId: line.driverId,
          fleetPartnerId: opts.fleetPartnerId,
          amountKwd: line.amount,
          method: "FLEET_ACCOUNT",
          receivedById: opts.actorId,
        },
      });

      const posted = await postLedgerTransaction(tx, {
        tenantId: opts.tenantId,
        type: "REMITTANCE",
        idempotencyKey: `remit:${remittance.id}`,
        remittanceId: remittance.id,
        memo: opts.note?.trim() || "Settled from the delivery company's cash account",
        createdById: opts.actorId,
        legs: [
          {
            accountId: driverAccount.id,
            ownerType: "DRIVER_CASH",
            direction: "CREDIT",
            amountKwd: line.amount,
          },
          {
            // Clearing does not move here: Darb took this money at deposit
            // confirmation. What changes is who it is earmarked against.
            accountId: fleetAccount.id,
            ownerType: "FLEET_CASH",
            direction: "DEBIT",
            amountKwd: line.amount,
          },
        ],
      });
      if (posted?.balances[fleetAccount.id]) balance = posted.balances[fleetAccount.id];

      lines.push({
        driverId: line.driverId,
        driverName: nameById.get(line.driverId) ?? "",
        amountKwd: line.amount.toFixed(3),
        remittanceId: remittance.id,
      });
    }

    return { lines, balance };
  });

  // One event per driver, the same `remittance.recorded` the cash desk publishes,
  // so anything already listening (the driver app, the activity feed) sees a
  // company settlement without knowing this feature exists.
  for (const line of result.lines) {
    publishEvent({
      type: "remittance.recorded",
      tenantId: opts.tenantId,
      payload: {
        remittanceId: line.remittanceId,
        driverId: line.driverId,
        driverName: line.driverName,
        amountKwd: line.amountKwd,
        method: "FLEET_ACCOUNT",
        fleetPartnerId: opts.fleetPartnerId,
      },
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }

  return {
    totalKwd: total.toFixed(3),
    balanceKwd: toKwdString(result.balance),
    lines: result.lines,
  };
}
