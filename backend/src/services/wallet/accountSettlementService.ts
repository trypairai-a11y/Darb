/**
 * Revision 24 (#7) — Finance › Money › Settle accounts.
 *
 * Client note: "There should be one more tab for settling accounts with the
 * vendors and delivery companies. So if the amount is transferred, the action
 * we will take is pressing either Settled or Partially settled."
 *
 * WHAT IS OWED comes from the statements Darb already cuts every month, never
 * from a second calculation that could disagree with them:
 *
 *   - a shop: its `VendorStatement.closingBalanceKwd`. Positive means Darb owes
 *     the shop (DARB_PAYS); negative means the shop owes Darb (PARTY_PAYS).
 *   - a delivery company: its `FleetPayoutStatement` net payable (`netPayableKwd`
 *     when deductions apply, else `totalKwd`). Always DARB_PAYS.
 *
 * WHAT WAS TRANSFERRED is an `AccountSettlement` row per transfer, append-only.
 *
 * THE LEDGER. A Darb-pays statement already has exactly one payout posting it
 * is allowed to have: `vendor-payout:{id}` / `fleet-payout:{id}`, written by
 * postVendorPayout / postFleetPayout and idempotent on that key. Settling does
 * not invent a second posting beside it. A part-payment is recorded and posts
 * nothing; the transfer that brings the remaining balance to zero completes
 * the statement through that same payout function, inside the same
 * transaction, so the ledger moves once, for the full month, whichever screen
 * (the old Mark paid button or this tab) finished it. Money a SHOP pays Darb
 * enters the ledger through the top-up confirmation, as it always has, so a
 * PARTY_PAYS settlement is a record only and never posts.
 *
 * A delivery company's month cannot be settled, in part or in full, until the
 * company has CONFIRMED it (revision 13 #8). The gate is checked before any
 * row is written, because a part-payment against a figure the company never
 * agreed to is exactly the argument that rule exists to prevent.
 */
import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";
import { postVendorPayoutTx } from "./vendorSettlementService";
import { postFleetPayoutTx } from "../fleetService";
import { toKwdString } from "./walletService";

export type SettlementPartyType = "VENDOR" | "FLEET";
export type SettlementFlow = "DARB_PAYS" | "PARTY_PAYS";
export type SettleState = "OPEN" | "PARTIALLY_SETTLED" | "SETTLED";

export class SettlementError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "SettlementError";
  }
}

const ZERO = new Prisma.Decimal(0);

export interface SettlementTransfer {
  id: string;
  amountKwd: string;
  remainingKwd: string;
  status: string;
  transferredAt: Date;
  reference: string | null;
  note: string | null;
  payoutTxId: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: Date;
}

export interface SettleAccountRow {
  partyType: SettlementPartyType;
  partyId: string;
  partyName: string;
  statementId: string;
  periodStart: Date;
  periodEnd: Date;
  flow: SettlementFlow;
  amountDueKwd: string;
  settledKwd: string;
  remainingKwd: string;
  state: SettleState;
  /** The statement's own status (FINAL | CONFIRMED | DISPUTED | PAID). */
  statementStatus: string;
  /** True when the statement was paid from its own screen, not this tab. */
  paidOutsideSettlement: boolean;
  /** False with a reason code when finance may not record a transfer now. */
  canSettle: boolean;
  blockedReason: "NOT_CONFIRMED" | "DISPUTED" | "SETTLED" | null;
  lastTransferAt: Date | null;
  transfers: SettlementTransfer[];
}

/** The amount and direction a statement asks for, or null when nothing is owed. */
function vendorDue(closing: Prisma.Decimal): { flow: SettlementFlow; due: Prisma.Decimal } | null {
  if (closing.isZero()) return null;
  return closing.gt(0) ? { flow: "DARB_PAYS", due: closing } : { flow: "PARTY_PAYS", due: closing.abs() };
}

function fleetDue(s: { netPayableKwd: Prisma.Decimal | null; totalKwd: Prisma.Decimal }): { flow: SettlementFlow; due: Prisma.Decimal } | null {
  const payable = s.netPayableKwd ?? s.totalKwd;
  if (payable.lte(0)) return null;
  return { flow: "DARB_PAYS", due: payable };
}

function stateOf(settled: Prisma.Decimal, due: Prisma.Decimal): SettleState {
  if (settled.gte(due)) return "SETTLED";
  return settled.gt(0) ? "PARTIALLY_SETTLED" : "OPEN";
}

export async function listSettleAccounts(opts: {
  tenantId: string;
  partyType?: SettlementPartyType;
  /** "open" = OPEN + PARTIALLY_SETTLED (default), "settled", or "all". */
  state?: "open" | "settled" | "all";
  /** YYYY-MM: only the statement for that month. */
  month?: string;
}): Promise<{ data: SettleAccountRow[]; totals: { owedByDarbKwd: string; owedToDarbKwd: string; open: number; partial: number } }> {
  const { tenantId, partyType } = opts;
  const state = opts.state ?? "open";

  let periodStart: Date | undefined;
  if (opts.month) {
    const m = /^(\d{4})-(\d{2})$/.exec(opts.month);
    if (!m) throw new SettlementError("month must be YYYY-MM", "BAD_MONTH");
    periodStart = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  }
  const periodWhere = periodStart ? { periodStart } : {};

  const [vendorStatements, fleetStatements] = await Promise.all([
    partyType === "FLEET"
      ? Promise.resolve([])
      : prisma.vendorStatement.findMany({
          where: { tenantId, ...periodWhere },
          orderBy: { periodStart: "desc" },
          take: 500,
          include: { vendor: { select: { name: true } } },
        }),
    partyType === "VENDOR"
      ? Promise.resolve([])
      : prisma.fleetPayoutStatement.findMany({
          where: { tenantId, ...periodWhere },
          orderBy: { periodStart: "desc" },
          take: 500,
          include: { fleet: { select: { name: true } } },
        }),
  ]);

  const statementIds = [...vendorStatements.map((s) => s.id), ...fleetStatements.map((s) => s.id)];
  const transfers = statementIds.length
    ? await prisma.accountSettlement.findMany({
        where: { tenantId, statementId: { in: statementIds } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const authorIds = [...new Set(transfers.map((t) => t.createdById))];
  const authors = authorIds.length
    ? await prisma.user.findMany({ where: { tenantId, id: { in: authorIds } }, select: { id: true, name: true } })
    : [];
  const authorName = new Map(authors.map((a) => [a.id, a.name]));
  const byStatement = new Map<string, typeof transfers>();
  for (const t of transfers) {
    const key = `${t.partyType}:${t.statementId}`;
    const list = byStatement.get(key) ?? [];
    list.push(t);
    byStatement.set(key, list);
  }

  const rows: SettleAccountRow[] = [];
  const build = (
    partyType: SettlementPartyType,
    s: { id: string; periodStart: Date; periodEnd: Date; status: string },
    partyId: string,
    partyName: string,
    owed: { flow: SettlementFlow; due: Prisma.Decimal },
  ) => {
    const list = byStatement.get(`${partyType}:${s.id}`) ?? [];
    let settled = list.reduce((sum, t) => sum.plus(t.amountKwd), ZERO);
    const paidOutside = s.status === "PAID" && settled.lt(owed.due);
    // Paid from the statement's own screen: the money went, the ledger has
    // it, so the account reads settled even with no transfer recorded here.
    if (paidOutside) settled = owed.due;
    const st = stateOf(settled, owed.due);
    let blockedReason: SettleAccountRow["blockedReason"] = null;
    if (st === "SETTLED") blockedReason = "SETTLED";
    else if (partyType === "FLEET" && s.status === "DISPUTED") blockedReason = "DISPUTED";
    else if (partyType === "FLEET" && s.status !== "CONFIRMED") blockedReason = "NOT_CONFIRMED";
    rows.push({
      partyType,
      partyId,
      partyName,
      statementId: s.id,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      flow: owed.flow,
      amountDueKwd: owed.due.toFixed(3),
      settledKwd: settled.toFixed(3),
      remainingKwd: Prisma.Decimal.max(owed.due.minus(settled), ZERO).toFixed(3),
      state: st,
      statementStatus: s.status,
      paidOutsideSettlement: paidOutside,
      canSettle: blockedReason === null,
      blockedReason,
      lastTransferAt: list.length ? list[list.length - 1].transferredAt : null,
      transfers: list
        .slice()
        .reverse()
        .map((t) => ({
          id: t.id,
          amountKwd: toKwdString(t.amountKwd),
          remainingKwd: toKwdString(t.remainingKwd),
          status: t.status,
          transferredAt: t.transferredAt,
          reference: t.reference,
          note: t.note,
          payoutTxId: t.payoutTxId,
          createdById: t.createdById,
          createdByName: authorName.get(t.createdById) ?? null,
          createdAt: t.createdAt,
        })),
    });
  };

  for (const s of vendorStatements) {
    const owed = vendorDue(s.closingBalanceKwd);
    if (owed) build("VENDOR", s, s.vendorId, s.vendor?.name ?? "n/a", owed);
  }
  for (const s of fleetStatements) {
    const owed = fleetDue(s);
    if (owed) build("FLEET", s, s.fleetPartnerId, s.fleet?.name ?? "n/a", owed);
  }

  const filtered = rows.filter((r) =>
    state === "all" ? true : state === "settled" ? r.state === "SETTLED" : r.state !== "SETTLED",
  );
  // Newest month first, then the biggest balance still open.
  filtered.sort(
    (a, b) =>
      b.periodStart.getTime() - a.periodStart.getTime() ||
      Number(b.remainingKwd) - Number(a.remainingKwd) ||
      a.partyName.localeCompare(b.partyName),
  );

  let owedByDarb = ZERO;
  let owedToDarb = ZERO;
  let open = 0;
  let partial = 0;
  for (const r of rows) {
    if (r.state === "OPEN") open += 1;
    if (r.state === "PARTIALLY_SETTLED") partial += 1;
    if (r.state === "SETTLED") continue;
    if (r.flow === "DARB_PAYS") owedByDarb = owedByDarb.plus(r.remainingKwd);
    else owedToDarb = owedToDarb.plus(r.remainingKwd);
  }

  return {
    data: filtered,
    totals: { owedByDarbKwd: owedByDarb.toFixed(3), owedToDarbKwd: owedToDarb.toFixed(3), open, partial },
  };
}

export interface RecordSettlementInput {
  tenantId: string;
  actorId: string;
  partyType: SettlementPartyType;
  statementId: string;
  /** SETTLED pays whatever is still open; PARTIALLY_SETTLED needs an amount. */
  action: "SETTLED" | "PARTIALLY_SETTLED";
  amountKwd?: string;
  transferredAt: Date;
  reference?: string | null;
  note?: string | null;
}

export async function recordSettlement(input: RecordSettlementInput) {
  const { tenantId, actorId, partyType, statementId, action } = input;

  if (input.transferredAt.getTime() > Date.now() + 5 * 60_000) {
    throw new SettlementError("The transfer date cannot be in the future", "FUTURE_DATE");
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        // ── What is owed ──────────────────────────────────────────────
        let partyId: string;
        let periodStart: Date;
        let periodEnd: Date;
        let owed: { flow: SettlementFlow; due: Prisma.Decimal } | null;
        let statementStatus: string;
        if (partyType === "VENDOR") {
          const s = await tx.vendorStatement.findFirst({ where: { id: statementId, tenantId } });
          if (!s) throw new SettlementError("Statement not found", "NOT_FOUND", 404);
          partyId = s.vendorId;
          periodStart = s.periodStart;
          periodEnd = s.periodEnd;
          owed = vendorDue(s.closingBalanceKwd);
          statementStatus = s.status;
        } else {
          const s = await tx.fleetPayoutStatement.findFirst({ where: { id: statementId, tenantId } });
          if (!s) throw new SettlementError("Statement not found", "NOT_FOUND", 404);
          partyId = s.fleetPartnerId;
          periodStart = s.periodStart;
          periodEnd = s.periodEnd;
          owed = fleetDue(s);
          statementStatus = s.status;
          if (owed && s.status === "DISPUTED") {
            throw new SettlementError(
              "The delivery company has disputed this statement. Settle the query before paying it.",
              "DISPUTED",
              409,
            );
          }
          if (owed && s.status !== "CONFIRMED" && s.status !== "PAID") {
            throw new SettlementError(
              "The delivery company has not confirmed this statement yet.",
              "NOT_CONFIRMED",
              409,
            );
          }
        }
        if (!owed) throw new SettlementError("Nothing is owed on this statement", "NOTHING_OWED", 409);
        if (statementStatus === "PAID") {
          throw new SettlementError("This account is already settled", "ALREADY_SETTLED", 409);
        }

        // ── What is already transferred ───────────────────────────────
        const agg = await tx.accountSettlement.aggregate({
          where: { tenantId, partyType, statementId },
          _sum: { amountKwd: true },
        });
        const settled = agg._sum.amountKwd ?? ZERO;
        const remaining = owed.due.minus(settled);
        if (remaining.lte(0)) {
          throw new SettlementError("This account is already settled", "ALREADY_SETTLED", 409);
        }

        let amount: Prisma.Decimal;
        if (action === "SETTLED") {
          amount = remaining;
        } else {
          const raw = String(input.amountKwd ?? "");
          if (!/^\d+(\.\d{1,3})?$/.test(raw) || Number(raw) <= 0) {
            throw new SettlementError("Enter the amount transferred, up to 3 decimal places", "BAD_AMOUNT");
          }
          amount = new Prisma.Decimal(raw);
          if (amount.gt(remaining)) {
            throw new SettlementError(
              `That is more than the ${remaining.toFixed(3)} KD still open on this account`,
              "OVER_REMAINING",
            );
          }
        }

        const after = remaining.minus(amount);
        const status = after.lte(0) ? "SETTLED" : "PARTIALLY_SETTLED";

        // ── The ledger: once, for the whole month, through the payout ──
        let payoutTxId: string | null = null;
        if (status === "SETTLED" && owed.flow === "DARB_PAYS") {
          const posted =
            partyType === "VENDOR"
              ? await postVendorPayoutTx(tx, { tenantId, statementId, actorId })
              : await postFleetPayoutTx(tx, { tenantId, statementId, actorId });
          payoutTxId = posted?.transactionId ?? null;
        }

        const row = await tx.accountSettlement.create({
          data: {
            tenantId,
            partyType,
            partyId,
            statementId,
            periodStart,
            periodEnd,
            flow: owed.flow,
            amountDueKwd: owed.due,
            amountKwd: amount,
            remainingKwd: Prisma.Decimal.max(after, ZERO),
            status,
            transferredAt: input.transferredAt,
            reference: input.reference?.trim() || null,
            note: input.note?.trim() || null,
            payoutTxId,
            createdById: actorId,
          },
        });

        return {
          id: row.id,
          status,
          amountKwd: amount.toFixed(3),
          remainingKwd: Prisma.Decimal.max(after, ZERO).toFixed(3),
          payoutTxId,
        };
      },
      // Two accountants pressing at once must not both pass the remaining
      // check and over-settle the month.
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if ((err as { code?: string })?.code === "P2034") {
      throw new SettlementError("Someone else just recorded a transfer here. Refresh and try again.", "CONFLICT", 409);
    }
    throw err;
  }
}
