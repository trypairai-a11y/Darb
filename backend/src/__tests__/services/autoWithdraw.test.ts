// F12 payout lifecycle — triggerWithdrawal / settleWithdrawal / failWithdrawal.
//
// This path had ZERO coverage until 2026-07-20, which is how it shipped with
// a "// Stub: pretend the payout provider succeeded immediately" line that
// marked every withdrawal WITHDRAWN and every Billing PAID the instant a tax
// invoice was accepted — with no payout provider wired up at all. The books
// reported partners as paid when nothing had been sent to a bank.
//
// The load-bearing assertion in this file is the first one: accepting an
// invoice must NOT produce a PAID billing.

import { getMockPrisma, resetAllMocks } from "../setup";
import { Prisma } from "../../generated/prisma";

const prisma = getMockPrisma();

prisma.taxInvoice = prisma.taxInvoice ?? {};
prisma.taxInvoice.findUnique = prisma.taxInvoice.findUnique ?? jest.fn();
prisma.billing = prisma.billing ?? {};
prisma.billing.update = prisma.billing.update ?? jest.fn();
prisma.paymentWithdrawal = prisma.paymentWithdrawal ?? {};
for (const fn of ["findFirst", "create", "update", "updateMany"]) {
  prisma.paymentWithdrawal[fn] = prisma.paymentWithdrawal[fn] ?? jest.fn();
}

const {
  triggerWithdrawal,
  settleWithdrawal,
  failWithdrawal,
} = require("../../queues/autoWithdrawWorker");

const TENANT = "t-1";
const BILLING_ID = "bil-1";
const WITHDRAWAL_ID = "wd-1";

const ACCEPTED_INVOICE = {
  id: "inv-1",
  status: "ACCEPTED",
  billingId: BILLING_ID,
  billing: {
    id: BILLING_ID,
    tenantId: TENANT,
    groupId: "g-1",
    groupName: "Group One",
    payableAmount: new Prisma.Decimal("1250.500"),
    partner: { bankAccounts: [{ tailNumber: "4321" }] },
  },
};

const PENDING_WITHDRAWAL = {
  id: WITHDRAWAL_ID,
  tenantId: TENANT,
  billingId: BILLING_ID,
  status: "PENDING",
};

/** All billing.update calls flattened to their `data` payloads. */
const billingWrites = () => prisma.billing.update.mock.calls.map((c: any) => c[0].data);

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
});

describe("triggerWithdrawal", () => {
  beforeEach(() => {
    prisma.taxInvoice.findUnique.mockResolvedValue(ACCEPTED_INVOICE);
    prisma.paymentWithdrawal.findFirst.mockResolvedValue(null);
    prisma.billing.update.mockResolvedValue({});
    prisma.paymentWithdrawal.create.mockImplementation(async ({ data }: any) => ({
      id: WITHDRAWAL_ID,
      ...data,
    }));
  });

  test("REGRESSION: accepting an invoice never marks the billing PAID", async () => {
    await triggerWithdrawal("inv-1");

    expect(billingWrites()).not.toContainEqual(expect.objectContaining({ status: "PAID" }));
    expect(billingWrites()).toEqual([{ status: "APPROVED" }]);
  });

  test("REGRESSION: the withdrawal is left PENDING, never WITHDRAWN", async () => {
    const withdrawal = await triggerWithdrawal("inv-1");

    expect(withdrawal.status).toBe("PENDING");
    expect(withdrawal.operationStatus).toBe("Withdrawing");
    // Nothing may flip the freshly created row to a settled state.
    expect(prisma.paymentWithdrawal.update).not.toHaveBeenCalled();
    expect(prisma.paymentWithdrawal.updateMany).not.toHaveBeenCalled();
  });

  test("records the payout intent against the partner's bank account", async () => {
    await triggerWithdrawal("inv-1");

    const { data } = prisma.paymentWithdrawal.create.mock.calls[0][0];
    expect(data).toMatchObject({
      tenantId: TENANT,
      billingId: BILLING_ID,
      tailNumber: "4321",
      status: "PENDING",
    });
    expect(String(data.amountKwd)).toBe("1250.5");
  });

  test("is idempotent — a second accept returns the existing withdrawal", async () => {
    prisma.paymentWithdrawal.findFirst.mockResolvedValue(PENDING_WITHDRAWAL);

    const result = await triggerWithdrawal("inv-1");

    expect(result).toEqual(PENDING_WITHDRAWAL);
    expect(prisma.paymentWithdrawal.create).not.toHaveBeenCalled();
    expect(prisma.billing.update).not.toHaveBeenCalled();
  });

  test("refuses an invoice that is not ACCEPTED", async () => {
    prisma.taxInvoice.findUnique.mockResolvedValue({ ...ACCEPTED_INVOICE, status: "SUBMITTED" });

    await expect(triggerWithdrawal("inv-1")).rejects.toThrow(/must be ACCEPTED/);
    expect(prisma.paymentWithdrawal.create).not.toHaveBeenCalled();
  });

  test("refuses a partner with no bank account on file", async () => {
    prisma.taxInvoice.findUnique.mockResolvedValue({
      ...ACCEPTED_INVOICE,
      billing: { ...ACCEPTED_INVOICE.billing, partner: { bankAccounts: [] } },
    });

    await expect(triggerWithdrawal("inv-1")).rejects.toThrow(/no bank account/);
    expect(prisma.billing.update).not.toHaveBeenCalled();
  });
});

describe("settleWithdrawal", () => {
  test("PENDING → WITHDRAWN and billing → PAID, stamped with the reference", async () => {
    prisma.paymentWithdrawal.findFirst
      .mockResolvedValueOnce(PENDING_WITHDRAWAL)
      .mockResolvedValueOnce({ ...PENDING_WITHDRAWAL, status: "WITHDRAWN" });
    prisma.paymentWithdrawal.updateMany.mockResolvedValue({ count: 1 });
    prisma.billing.update.mockResolvedValue({});

    await settleWithdrawal(TENANT, WITHDRAWAL_ID, { reference: "NBK-99", actor: "acct@darb.com" });

    const guard = prisma.paymentWithdrawal.updateMany.mock.calls[0][0];
    expect(guard.where).toEqual({ id: WITHDRAWAL_ID, tenantId: TENANT, status: "PENDING" });
    expect(guard.data).toMatchObject({ status: "WITHDRAWN", operationStatus: "Withdrawn" });
    expect(guard.data.note).toContain("NBK-99");
    expect(guard.data.note).toContain("acct@darb.com");
    expect(billingWrites()).toEqual([{ status: "PAID" }]);
  });

  test("double-settle is blocked by the guarded update — billing is not re-PAID", async () => {
    prisma.paymentWithdrawal.findFirst.mockResolvedValue(PENDING_WITHDRAWAL);
    prisma.paymentWithdrawal.updateMany.mockResolvedValue({ count: 0 }); // lost the race

    await expect(
      settleWithdrawal(TENANT, WITHDRAWAL_ID, { reference: "NBK-99" }),
    ).rejects.toThrow(/already settled or failed/);
    expect(prisma.billing.update).not.toHaveBeenCalled();
  });

  test("an already-WITHDRAWN row is rejected before any write", async () => {
    prisma.paymentWithdrawal.findFirst.mockResolvedValue({
      ...PENDING_WITHDRAWAL,
      status: "WITHDRAWN",
    });

    await expect(settleWithdrawal(TENANT, WITHDRAWAL_ID, { reference: "x" })).rejects.toThrow(
      /only PENDING can be settled/,
    );
    expect(prisma.paymentWithdrawal.updateMany).not.toHaveBeenCalled();
    expect(prisma.billing.update).not.toHaveBeenCalled();
  });

  test("is tenant-scoped — another tenant's withdrawal is not found", async () => {
    prisma.paymentWithdrawal.findFirst.mockResolvedValue(null);

    await expect(settleWithdrawal("t-other", WITHDRAWAL_ID, { reference: "x" })).rejects.toThrow(
      /not found/,
    );
    const lookup = prisma.paymentWithdrawal.findFirst.mock.calls[0][0];
    expect(lookup.where).toEqual({ id: WITHDRAWAL_ID, tenantId: "t-other" });
  });
});

describe("failWithdrawal", () => {
  test("PENDING → FAILED and billing drops back to APPROVED, never PAID", async () => {
    prisma.paymentWithdrawal.findFirst
      .mockResolvedValueOnce(PENDING_WITHDRAWAL)
      .mockResolvedValueOnce({ ...PENDING_WITHDRAWAL, status: "FAILED" });
    prisma.paymentWithdrawal.updateMany.mockResolvedValue({ count: 1 });
    prisma.billing.update.mockResolvedValue({});

    await failWithdrawal(TENANT, WITHDRAWAL_ID, { reason: "IBAN rejected" });

    expect(prisma.paymentWithdrawal.updateMany.mock.calls[0][0].data).toMatchObject({
      status: "FAILED",
      operationStatus: "Failed",
    });
    expect(prisma.paymentWithdrawal.updateMany.mock.calls[0][0].data.note).toContain(
      "IBAN rejected",
    );
    expect(billingWrites()).toEqual([{ status: "APPROVED" }]);
    expect(billingWrites()).not.toContainEqual(expect.objectContaining({ status: "PAID" }));
  });

  test("cannot fail a withdrawal that already settled", async () => {
    prisma.paymentWithdrawal.findFirst.mockResolvedValue({
      ...PENDING_WITHDRAWAL,
      status: "WITHDRAWN",
    });

    await expect(failWithdrawal(TENANT, WITHDRAWAL_ID, {})).rejects.toThrow(
      /only PENDING can be failed/,
    );
    expect(prisma.billing.update).not.toHaveBeenCalled();
  });
});
