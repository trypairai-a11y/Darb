// Darb 2.0 revision 15 (#2) — the HQ support inbox (/api/support).
//
// SupportTicket was deliberately built as ONE table with a nullable vendorId
// and a fleetPartnerId beside it, on the reasoning that "a duplicate table
// would have meant a second triage screen nobody remembers to open". The table
// stayed single and the screen was never built at all: staff could only read a
// shop's requests from inside that shop's detail panel (/api/vendors/:id/support)
// and a delivery company's from inside that company's (/api/fleets/:id/support).
// So a request from a merchant nobody happened to open that day was invisible,
// which is what the client asked about ("where can we see the support requests?").
//
// This router is that inbox and nothing more: it reads across both sides and
// answers, reusing the exact reply semantics the two per-owner endpoints already
// enforce (a CANCELLED request stays cancelled, a reply moves OPEN to ANSWERED,
// resolve moves it to RESOLVED).

import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { getPagination, paginatedResponse } from "../utils/pagination";

const MUTATE = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"];
const READ = ["ADMIN", "OPS_MANAGER", "SUPERVISOR", "ACCOUNTANT"];

const router = Router();
router.use(authMiddleware, tenantScope);

const STATUSES = ["OPEN", "ANSWERED", "RESOLVED", "CANCELLED"] as const;
type TicketStatus = (typeof STATUSES)[number];

/**
 * @swagger
 * /api/support:
 *   get:
 *     tags: [Support]
 *     summary: Every support request, from shops and delivery companies alike
 *     description: >
 *       ?status=OPEN|ANSWERED|RESOLVED|CANCELLED narrows by state and
 *       ?source=vendor|fleet by who raised it. The default is everything still
 *       needing an answer (OPEN + ANSWERED), because an inbox that opens on
 *       resolved tickets is an inbox nobody trusts.
 */
router.get("/", rbac(...READ), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { page, limit, skip } = getPagination(req);

    const statusParam = typeof req.query.status === "string" ? req.query.status : "";
    const source = typeof req.query.source === "string" ? req.query.source : "";

    const where: Record<string, unknown> = { tenantId };
    if (STATUSES.includes(statusParam as TicketStatus)) {
      where.status = statusParam;
    } else {
      where.status = { in: ["OPEN", "ANSWERED"] };
    }
    if (source === "vendor") where.vendorId = { not: null };
    if (source === "fleet") where.fleetPartnerId = { not: null };

    const [rows, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where: where as never,
        include: {
          vendor: { select: { id: true, name: true, nameAr: true } },
          fleet: { select: { id: true, name: true } },
          messages: { orderBy: { createdAt: "asc" } },
        },
        // OPEN before ANSWERED before RESOLVED is alphabetical by luck, so the
        // oldest thing still waiting sits at the top of the first page.
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.supportTicket.count({ where: where as never }),
    ]);

    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/support/counts:
 *   get:
 *     tags: [Support]
 *     summary: What is waiting, for the Setup card badge
 *     description: >
 *       Counts the two things the Setup tile promises in one round trip:
 *       support requests nobody has answered and fleet requests nobody has
 *       decided. A tile that says "3" is what makes the screen worth opening.
 */
router.get("/counts", rbac(...READ), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const [openSupport, pendingApprovals] = await Promise.all([
      prisma.supportTicket.count({ where: { tenantId, status: { in: ["OPEN", "ANSWERED"] } } }),
      prisma.fleetChangeRequest.count({ where: { tenantId, status: "PENDING" } }),
    ]);
    res.json({ openSupport, pendingApprovals, total: openSupport + pendingApprovals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/support/{id}/reply:
 *   post:
 *     tags: [Support]
 *     summary: Answer a support request, and optionally close it
 */
router.post("/:id/reply", rbac(...MUTATE), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const resolve = req.body?.resolve === true;
    if (!body && !resolve) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true, status: true },
    });
    if (!ticket) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    // Same guard the per-owner endpoints carry: the shop withdrew this, and
    // answering it would flip it back to ANSWERED and overrule their decision.
    if (ticket.status === "CANCELLED") {
      res.status(409).json({ error: "This request was cancelled by whoever raised it" });
      return;
    }

    if (body) {
      await prisma.supportTicketMessage.create({
        data: {
          tenantId,
          ticketId: ticket.id,
          author: "DARB",
          authorName: req.user!.email ?? null,
          body,
        },
      });
    }
    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: resolve ? "RESOLVED" : "ANSWERED" },
      include: {
        vendor: { select: { id: true, name: true, nameAr: true } },
        fleet: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
