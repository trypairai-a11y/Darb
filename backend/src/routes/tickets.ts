import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { getPagination, paginatedResponse } from "../utils/pagination";
import { nextTicketNumber } from "../utils/ticketNumber";
import { ticketSlaDeadline } from "../utils/ticketSla";

const router = Router();
router.use(authMiddleware, tenantScope);

router.get("/", async (req: Request, res: Response) => {
  try {
    const { skip, limit, page } = getPagination(req);
    const tenantId = req.user!.tenantId;
    const { status, priority, category, platform, assignedToId, sort } = req.query;
    const where: any = { tenantId };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (category) where.category = category;
    if (platform) where.platform = platform;
    if (assignedToId) where.assignedToId = assignedToId;

    let orderBy: any = { createdAt: "desc" };
    if (sort === "oldest") orderBy = { createdAt: "asc" };
    if (sort === "priority") orderBy = [{ priority: "desc" }, { createdAt: "desc" }];
    if (sort === "sla") orderBy = { slaDeadline: "asc" };

    const [data, total] = await Promise.all([
      prisma.ticket.findMany({
        where, skip, take: limit,
        orderBy,
        include: {
          driver: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
          submitterDriver: { select: { id: true, name: true } },
          submitterUser: { select: { id: true, name: true } },
        },
      }),
      prisma.ticket.count({ where }),
    ]);
    res.json(paginatedResponse(data, total, page, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: {
        driver: true,
        assignedTo: true,
        company: true,
        vehicle: true,
        submitterDriver: { select: { id: true, name: true } },
        submitterUser: { select: { id: true, name: true } },
      },
    });
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
    res.json(ticket);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const ticketNumber = await nextTicketNumber(tenantId);
    const slaDeadline = ticketSlaDeadline(req.body.priority);

    const ticket = await prisma.ticket.create({
      data: {
        ...req.body,
        tenantId,
        ticketNumber,
        slaDeadline,
      },
    });
    res.status(201).json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const allowed = [
      "category", "priority", "title", "description",
      "assignedToId", "status", "photos", "resolution", "resolvedAt",
      "slaDeadline", "platform", "companyId", "driverId", "vehicleId",
    ] as const;
    const data: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in (req.body ?? {})) data[k] = (req.body as any)[k];
    }
    const ticket = await prisma.ticket.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data,
    });
    if (ticket.count === 0) { res.status(404).json({ error: "Ticket not found" }); return; }
    const updated = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id/assign", async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.ticket.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data: { assignedToId: req.body.assignedToId, status: "ASSIGNED" },
    });
    if (ticket.count === 0) { res.status(404).json({ error: "Ticket not found" }); return; }
    res.json({ message: "Ticket assigned" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id/resolve", async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.ticket.updateMany({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      data: {
        status: "RESOLVED",
        resolution: req.body.resolution,
        resolvedAt: new Date(),
      },
    });
    if (ticket.count === 0) { res.status(404).json({ error: "Ticket not found" }); return; }
    res.json({ message: "Ticket resolved" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
