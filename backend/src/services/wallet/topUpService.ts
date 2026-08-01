/**
 * Merchant wallet top-ups (revision 10, #2).
 *
 * What this replaces: the Top up button opened a modal that told the merchant to
 * make a bank transfer quoting their shop code, and somebody at Darb matched it
 * up by hand afterwards. The client asked for the system to suggest an amount,
 * let the shop change it, and then take them straight to a payment link.
 *
 * Three pieces:
 *
 *   suggestTopUp   — what to prefill the field with. Enough to clear what the
 *                    shop owes plus roughly a week of its own spend, so the
 *                    suggestion is about the shop's actual burn rate rather
 *                    than a round number we invented.
 *   createTopUp    — records the intent to pay and hands back a link. With a
 *                    gateway configured that is the gateway's hosted checkout;
 *                    without one it is the Darb payment page for the token,
 *                    which carries the amount and the transfer reference.
 *   confirmTopUp   — posts the wallet credit. Keyed `topup:{id}`, so a webhook
 *                    delivered three times credits once.
 *
 * The gateway is MyFatoorah, which is what covers KNET in Kuwait. It activates
 * on MYFATOORAH_API_KEY: until that is set the flow still works end to end and
 * the link lands on our own page, the same way WhatsApp stub-warns until Twilio
 * is configured rather than pretending to send.
 */
import { randomBytes } from "crypto";
import { Prisma } from "../../generated/prisma";
import { prisma } from "../../config";
import { ensureAccount, postLedgerTransaction, vendorOwnerKey } from "./walletService";

export class TopUpError extends Error {}

/** 128-bit random, url-safe. Same shape as the tracking token. */
function generateToken(): string {
  return randomBytes(16).toString("hex");
}

/** Short reference a human can read down a phone line. */
function generateReference(): string {
  return `TOP-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/**
 * Where the merchant-facing payment page lives.
 *
 * Its own variable rather than reusing PUBLIC_TRACKING_BASE_URL, which points at
 * the customer tracking domain: a shop owner paying an invoice should land on
 * the portal they already log into, not on the domain their customers use to
 * follow a driver. The two fallbacks keep the link working on a deploy that has
 * not set it yet, since any of these domains serves /pay.
 */
function baseUrl(): string | null {
  const base =
    process.env.PUBLIC_PORTAL_BASE_URL ||
    process.env.PUBLIC_TRACKING_BASE_URL ||
    process.env.FRONTEND_URL;
  return base ? base.replace(/\/+$/, "") : null;
}

/** The Darb-hosted page for one top-up. Null when no public base URL is set. */
export function payUrl(token: string): string | null {
  const base = baseUrl();
  return base ? `${base}/pay/${token}` : null;
}

// ─── Suggestion ──────────────────────────────────────────────────────────────

const MIN_SUGGESTION = new Prisma.Decimal(10);
const ROUND_TO = new Prisma.Decimal(5);
const BURN_DAYS = 7;

/** Round up to the next multiple of 5 KD, so the field never prefills 23.457. */
function roundUp(value: Prisma.Decimal): Prisma.Decimal {
  if (value.lessThanOrEqualTo(0)) return new Prisma.Decimal(0);
  const steps = value.dividedBy(ROUND_TO).ceil();
  return steps.times(ROUND_TO);
}

export interface TopUpSuggestion {
  amountKwd: string;
  /** What the shop owes right now, which is the floor of any useful top-up. */
  outstandingKwd: string;
  /** Average daily delivery-fee spend over the last 30 days. */
  dailyBurnKwd: string;
}

/**
 * What to prefill the top-up field with.
 *
 * Debt first: a shop at its credit cap has orders being refused, and anything
 * short of clearing the debt does not fix that. On top of it, a week of the
 * shop's own average daily delivery-fee spend, so the suggestion is a top-up
 * that lasts rather than one that has to be repeated tomorrow.
 */
export async function suggestTopUp(tenantId: string, vendorId: string): Promise<TopUpSuggestion> {
  const [account, orders] = await Promise.all([
    prisma.walletAccount.findFirst({
      where: { tenantId, ownerKey: vendorOwnerKey(vendorId) },
      select: { balanceKwd: true },
    }),
    prisma.deliveryOrder.findMany({
      where: {
        tenantId,
        vendorId,
        status: "DELIVERED",
        deliveredAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      select: { deliveryFeeKwd: true },
      take: 10_000,
    }),
  ]);

  const balance = account?.balanceKwd ?? new Prisma.Decimal(0);
  const outstanding = balance.isNegative() ? balance.neg() : new Prisma.Decimal(0);

  let fees = new Prisma.Decimal(0);
  for (const order of orders) fees = fees.plus(order.deliveryFeeKwd ?? 0);
  const dailyBurn = fees.dividedBy(30);

  const raw = outstanding.plus(dailyBurn.times(BURN_DAYS));
  const suggestion = roundUp(raw).lessThan(MIN_SUGGESTION) ? MIN_SUGGESTION : roundUp(raw);

  return {
    amountKwd: suggestion.toFixed(3),
    outstandingKwd: outstanding.toFixed(3),
    dailyBurnKwd: dailyBurn.toFixed(3),
  };
}

// ─── Gateway ─────────────────────────────────────────────────────────────────

/**
 * Ask MyFatoorah for a hosted payment link. Returns null when the gateway is
 * not configured, or when it refuses: a failed gateway call must still leave the
 * merchant with a usable link (our own page) rather than a dead button.
 */
async function requestGatewayLink(opts: {
  amountKwd: Prisma.Decimal;
  reference: string;
  vendorName: string;
  callbackUrl: string | null;
}): Promise<{ url: string; providerRef: string } | null> {
  const apiKey = process.env.MYFATOORAH_API_KEY;
  if (!apiKey) return null;

  // Test and live are different hosts, so the base is configurable and defaults
  // to live: a deploy that sets the key without the host means to take money.
  const base = (process.env.MYFATOORAH_BASE_URL || "https://api.myfatoorah.com").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/v2/SendPayment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        NotificationOption: "LNK",
        CustomerName: opts.vendorName,
        InvoiceValue: Number(opts.amountKwd.toFixed(3)),
        DisplayCurrencyIso: "KWD",
        CustomerReference: opts.reference,
        CallBackUrl: opts.callbackUrl,
        ErrorUrl: opts.callbackUrl,
      }),
    });
    const json = (await res.json()) as {
      IsSuccess?: boolean;
      Data?: { InvoiceURL?: string; InvoiceId?: number | string };
    };
    const url = json?.Data?.InvoiceURL;
    if (!json?.IsSuccess || !url) return null;
    return { url, providerRef: String(json.Data?.InvoiceId ?? "") };
  } catch {
    // Network or shape failure. The caller falls back to the hosted page.
    return null;
  }
}

// ─── Create ──────────────────────────────────────────────────────────────────

export interface CreatedTopUp {
  id: string;
  amountKwd: string;
  reference: string;
  token: string;
  paymentUrl: string | null;
  provider: string;
  status: string;
  createdAt: Date;
}

export async function createTopUp(opts: {
  tenantId: string;
  vendorId: string;
  amountKwd: string | number;
  requestedById?: string | null;
}): Promise<CreatedTopUp> {
  const amount = new Prisma.Decimal(opts.amountKwd);
  if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
    throw new TopUpError("Amount must be greater than zero");
  }
  if (amount.greaterThan(50_000)) {
    throw new TopUpError("Amount is too large. Contact Darb to settle a balance this size.");
  }

  const vendor = await prisma.vendor.findFirst({
    where: { id: opts.vendorId, tenantId: opts.tenantId },
    select: { id: true, name: true },
  });
  if (!vendor) throw new TopUpError("Vendor not found");

  const token = generateToken();
  const reference = generateReference();

  const gateway = await requestGatewayLink({
    amountKwd: amount,
    reference,
    vendorName: vendor.name,
    callbackUrl: payUrl(token),
  });

  const row = await prisma.vendorTopUp.create({
    data: {
      tenantId: opts.tenantId,
      vendorId: opts.vendorId,
      requestedById: opts.requestedById ?? null,
      amountKwd: amount,
      token,
      reference,
      // With no gateway the link is our own page, which is still a link the
      // merchant can open, forward or pay from a phone.
      paymentUrl: gateway?.url ?? payUrl(token),
      providerRef: gateway?.providerRef ?? null,
      provider: gateway ? "MYFATOORAH" : "MANUAL",
    },
  });

  return {
    id: row.id,
    amountKwd: row.amountKwd.toFixed(3),
    reference: row.reference,
    token: row.token,
    paymentUrl: row.paymentUrl,
    provider: row.provider ?? "MANUAL",
    status: row.status,
    createdAt: row.createdAt,
  };
}

// ─── Confirm ─────────────────────────────────────────────────────────────────

/**
 * Mark a top-up paid and credit the merchant's wallet.
 *
 * CREDIT on VENDOR_PAYABLE raises the balance, which is what paying down a debt
 * looks like on a liability account; PLATFORM_CLEARING takes the matching debit
 * because the money is now in Darb's hands. Both the status flip and the posting
 * are guarded: the `updateMany` on status PENDING is the compare-and-set, and
 * `topup:{id}` is the ledger's own replay guard, so a webhook delivered three
 * times credits exactly once.
 */
export async function confirmTopUp(opts: {
  tenantId: string;
  topUpId: string;
  providerRef?: string | null;
  provider?: string | null;
}): Promise<{ ok: boolean; alreadyPaid: boolean }> {
  /**
   * The claim and the credit are ONE transaction.
   *
   * They used to be two: the row was flipped to PAID, and only then was the
   * ledger posted. A gateway webhook that died in between — a cold lambda, a
   * pooler blip — left a top-up marked PAID with no money in the wallet, and
   * the gateway's retry took the `alreadyPaid` branch and posted nothing. The
   * merchant had paid, the ledger had never heard of it, and nothing in the
   * nightly reconciliation looks for that shape.
   */
  const postCredit = async (
    tx: Prisma.TransactionClient,
    row: { id: string; vendorId: string; amountKwd: Prisma.Decimal; reference: string },
  ) => {
    const vendorAccount = await ensureAccount(tx, opts.tenantId, "VENDOR_PAYABLE", {
      vendorId: row.vendorId,
    });
    const clearing = await ensureAccount(tx, opts.tenantId, "PLATFORM_CLEARING");
    await postLedgerTransaction(tx, {
      tenantId: opts.tenantId,
      type: "TOP_UP",
      idempotencyKey: `topup:${row.id}`,
      memo: `Wallet top-up ${row.reference}`,
      legs: [
        {
          accountId: vendorAccount.id,
          ownerType: "VENDOR_PAYABLE",
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
  };

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.vendorTopUp.updateMany({
      where: { id: opts.topUpId, tenantId: opts.tenantId, status: "PENDING" },
      data: {
        status: "PAID",
        paidAt: new Date(),
        ...(opts.providerRef ? { providerRef: opts.providerRef } : {}),
        ...(opts.provider ? { provider: opts.provider } : {}),
      },
    });

    const row = await tx.vendorTopUp.findFirst({
      where: { id: opts.topUpId, tenantId: opts.tenantId },
      select: { id: true, vendorId: true, amountKwd: true, reference: true, status: true },
    });
    if (!row) return { ok: false, alreadyPaid: false };

    if (claimed.count === 0) {
      // Somebody else claimed it, or it was claimed before this fix existed.
      // Repair rather than shrug: if the posting is genuinely missing, make it.
      // Checked by key rather than caught as a unique violation, because a
      // P2002 inside an interactive transaction aborts the whole transaction.
      if (row.status !== "PAID") return { ok: false, alreadyPaid: false };
      const posted = await tx.walletTransaction.findFirst({
        where: { tenantId: opts.tenantId, idempotencyKey: `topup:${row.id}` },
        select: { id: true },
      });
      if (!posted) await postCredit(tx, row);
      return { ok: true, alreadyPaid: true };
    }

    await postCredit(tx, row);
    return { ok: true, alreadyPaid: false };
  });

  return result;
}

/** Give up on a pending top-up. Never touches a paid one. */
export async function cancelTopUp(tenantId: string, topUpId: string): Promise<boolean> {
  const result = await prisma.vendorTopUp.updateMany({
    where: { id: topUpId, tenantId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  return result.count > 0;
}

/** The public payload behind one payment token. Never leaks anything else. */
export async function readTopUpByToken(token: string): Promise<{
  id: string;
  reference: string;
  amountKwd: string;
  status: string;
  vendorName: string;
  vendorCode: string;
  gatewayUrl: string | null;
} | null> {
  const row = await prisma.vendorTopUp.findFirst({
    where: { token },
    select: {
      id: true,
      reference: true,
      amountKwd: true,
      status: true,
      provider: true,
      paymentUrl: true,
      vendor: { select: { name: true, code: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference,
    amountKwd: row.amountKwd.toFixed(3),
    status: row.status,
    vendorName: row.vendor.name,
    vendorCode: row.vendor.code,
    // Only a real gateway link is worth redirecting to. Handing back our own
    // page here would send the browser round in a circle.
    gatewayUrl: row.provider === "MYFATOORAH" ? row.paymentUrl : null,
  };
}
