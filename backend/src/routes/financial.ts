import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { triggerWithdrawal, settleWithdrawal, failWithdrawal } from "../queues/autoWithdrawWorker";

const router = Router();
router.use(authMiddleware, tenantScope);

// ─── Billings ────────────────────────────────────────────────────────────────
router.get("/billings", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { skip, limit, page } = getPagination(req);
    const where: any = { tenantId };
    if (req.query.partnerId) where.partnerId = req.query.partnerId;
    if (req.query.status) where.status = req.query.status;
    if (req.query.period) where.period = req.query.period;
    if (req.query.dateFrom || req.query.dateTo) {
      where.billingDate = {};
      if (req.query.dateFrom) where.billingDate.gte = new Date(req.query.dateFrom as string);
      if (req.query.dateTo) where.billingDate.lte = new Date(req.query.dateTo as string);
    }
    const [data, total] = await Promise.all([
      prisma.billing.findMany({
        where, skip, take: limit,
        orderBy: { billingDate: "desc" },
        include: { partner: { select: { name: true } }, taxInvoice: true },
      }),
      prisma.billing.count({ where }),
    ]);
    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/billings/:id", async (req: Request, res: Response) => {
  try {
    const billing = await prisma.billing.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { partner: true, taxInvoice: true, withdrawals: true },
    });
    if (!billing) { res.status(404).json({ error: "Billing not found" }); return; }
    res.json(billing);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Tax invoices ────────────────────────────────────────────────────────────
router.get("/tax-invoices", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { skip, limit, page } = getPagination(req);
    const where: any = { tenantId };
    if (req.query.status) where.status = req.query.status;
    if (req.query.dateFrom || req.query.dateTo) {
      where.issueDate = {};
      if (req.query.dateFrom) where.issueDate.gte = new Date(req.query.dateFrom as string);
      if (req.query.dateTo) where.issueDate.lte = new Date(req.query.dateTo as string);
    }
    const [data, total] = await Promise.all([
      prisma.taxInvoice.findMany({
        where, skip, take: limit,
        orderBy: { issueDate: "desc" },
        include: { billing: { include: { partner: { select: { name: true } } } } },
      }),
      prisma.taxInvoice.count({ where }),
    ]);
    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/tax-invoices", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { billingId, invoiceNo, issueDate, sellerName, totalAmount, fileUrl } = req.body;
    const billing = await prisma.billing.findFirst({ where: { id: billingId, tenantId } });
    if (!billing) { res.status(404).json({ error: "Billing not found" }); return; }
    const inv = await prisma.taxInvoice.create({
      data: {
        tenantId, billingId, invoiceNo, issueDate: new Date(issueDate),
        sellerName, totalAmount, fileUrl: fileUrl ?? null,
        status: "DRAFT",
      },
    });
    res.status(201).json(inv);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/tax-invoices/:id/submit", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const existing = await prisma.taxInvoice.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
    const inv = await prisma.taxInvoice.update({
      where: { id: req.params.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    await prisma.billing.update({
      where: { id: existing.billingId },
      data: { status: "AWAITING_APPROVAL" },
    });
    // Amendment A — notify ops that an invoice is pending acceptance.
    await prisma.notification.create({
      data: {
        tenantId,
        title: "Tax invoice pending acceptance",
        titleAr: "فاتورة ضريبية بانتظار الموافقة",
        message: `Invoice ${inv.invoiceNo} submitted and awaiting acceptance.`,
        bodyAr: `الفاتورة ${inv.invoiceNo} تم تقديمها وتنتظر الموافقة.`,
        type: "TAX_INVOICE_PENDING",
        severity: "MEDIUM",
        category: "IMPORTANT",
        sourceId: inv.id,
        metadata: { invoiceId: inv.id, billingId: inv.billingId },
      },
    });
    res.json(inv);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/tax-invoices/:id/accept", rbac("ADMIN", "OPS_MANAGER", "ACCOUNTANT"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const existing = await prisma.taxInvoice.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
    const inv = await prisma.taxInvoice.update({
      where: { id: req.params.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    const withdrawal = await triggerWithdrawal(inv.id);
    res.json({ invoice: inv, withdrawal });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/tax-invoices/:id/reject", rbac("ADMIN", "OPS_MANAGER", "ACCOUNTANT"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { reason } = req.body || {};
    const existing = await prisma.taxInvoice.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
    const inv = await prisma.taxInvoice.update({
      where: { id: req.params.id },
      data: { status: "REJECTED", rejectReason: reason ?? "No reason provided" },
    });
    await prisma.billing.update({ where: { id: existing.billingId }, data: { status: "REJECTED" } });
    res.json(inv);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Withdrawals ─────────────────────────────────────────────────────────────
router.get("/withdrawals", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { skip, limit, page } = getPagination(req);
    const where: any = { tenantId };
    if (req.query.status) where.status = req.query.status;
    if (req.query.dateFrom || req.query.dateTo) {
      where.withdrawTime = {};
      if (req.query.dateFrom) where.withdrawTime.gte = new Date(req.query.dateFrom as string);
      if (req.query.dateTo) where.withdrawTime.lte = new Date(req.query.dateTo as string);
    }
    const [data, total] = await Promise.all([
      prisma.paymentWithdrawal.findMany({
        where, skip, take: limit,
        orderBy: { withdrawTime: "desc" },
        include: { billing: { select: { billingId: true } } },
      }),
      prisma.paymentWithdrawal.count({ where }),
    ]);
    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Settlement is manual and explicit: accepting an invoice records a PENDING
// payout intent, and only a confirmed bank transfer moves it to WITHDRAWN /
// Billing PAID. ADMIN + ACCOUNTANT only — this is the write that says money
// left the account. A real payout-provider webhook would call the same
// settleWithdrawal/failWithdrawal service functions.
router.post("/withdrawals/:id/settle", rbac("ADMIN", "ACCOUNTANT"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { reference } = req.body || {};
    if (!reference || typeof reference !== "string" || !reference.trim()) {
      res.status(400).json({ error: "A bank transfer reference is required to settle a withdrawal" });
      return;
    }
    const withdrawal = await settleWithdrawal(tenantId, req.params.id, {
      reference: reference.trim(),
      actor: req.user!.email,
    });
    res.json(withdrawal);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/withdrawals/:id/fail", rbac("ADMIN", "ACCOUNTANT"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { reason } = req.body || {};
    const withdrawal = await failWithdrawal(tenantId, req.params.id, {
      reason: typeof reason === "string" && reason.trim() ? reason.trim() : undefined,
      actor: req.user!.email,
    });
    res.json(withdrawal);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const [pending, paid, lastWithdrawal, partners] = await Promise.all([
      prisma.billing.aggregate({ where: { tenantId, status: { in: ["PENDING_INVOICE", "AWAITING_APPROVAL", "APPROVED"] } }, _sum: { payableAmount: true } }),
      prisma.billing.aggregate({ where: { tenantId, status: "PAID" }, _sum: { payableAmount: true } }),
      prisma.paymentWithdrawal.findFirst({ where: { tenantId }, orderBy: { withdrawTime: "desc" }, include: { billing: { include: { partner: { include: { bankAccounts: true } } } } } }),
      prisma.partner.findMany({ where: { tenantId }, include: { bankAccounts: true } }),
    ]);
    const primaryBank = partners[0]?.bankAccounts[0];
    res.json({
      pendingAmount: pending._sum.payableAmount ?? 0,
      paidAmount: paid._sum.payableAmount ?? 0,
      withdrawableBalance: pending._sum.payableAmount ?? 0,
      lastWithdrawal,
      bank: primaryBank ? {
        bankName: primaryBank.bankName,
        accountName: primaryBank.accountName,
        tailNumber: primaryBank.tailNumber,
        verified: primaryBank.verified,
      } : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
