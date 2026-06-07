import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";

const router = Router();
router.use(authMiddleware, tenantScope);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List notifications for the current user
 *     parameters:
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: string, enum: ["true", "false"] }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [IMPORTANT, OPS_TODO, BENEFITS, OTHER] }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Notification list with total count
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const tenantId = req.user!.tenantId;
    const { unreadOnly, limit = "50", offset = "0" } = req.query;

    const where: any = { tenantId, userId };
    if (unreadOnly === "true") where.read = false;
    if (req.query.category) where.category = req.query.category as string;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Number(limit),
        skip: Number(offset),
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({ notifications, total });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/notifications/counts:
 *   get:
 *     tags: [Notifications]
 *     summary: Get unread notification counts per category
 *     responses:
 *       200:
 *         description: Unread counts for total, important, opsTodo, benefits, other
 */
router.get("/counts", async (req: Request, res: Response) => {
  try {
    const baseWhere = { tenantId: req.user!.tenantId, userId: req.user!.userId, read: false };
    const [total, important, opsTodo, benefits, other] = await Promise.all([
      prisma.notification.count({ where: baseWhere }),
      prisma.notification.count({ where: { ...baseWhere, category: "IMPORTANT" } }),
      prisma.notification.count({ where: { ...baseWhere, category: "OPS_TODO" } }),
      prisma.notification.count({ where: { ...baseWhere, category: "BENEFITS" } }),
      prisma.notification.count({ where: { ...baseWhere, category: "OTHER" } }),
    ]);
    res.json({ total, important, opsTodo, benefits, other });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     tags: [Notifications]
 *     summary: Get total unread notification count for the current user
 *     responses:
 *       200:
 *         description: Object with count field
 */
router.get("/unread-count", async (req: Request, res: Response) => {
  try {
    const count = await prisma.notification.count({
      where: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        read: false,
      },
    });
    res.json({ count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   put:
 *     tags: [Notifications]
 *     summary: Mark a single notification as read
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Success confirmation
 *       404:
 *         description: Notification not found
 */
router.put("/:id/read", async (req: Request, res: Response) => {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        id: req.params.id,
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
      },
      data: { read: true, readAt: new Date() },
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/notifications/read-all:
 *   put:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read for the current user
 *     responses:
 *       200:
 *         description: Number of notifications updated
 */
router.put("/read-all", async (req: Request, res: Response) => {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        read: false,
      },
      data: { read: true, readAt: new Date() },
    });
    res.json({ updated: result.count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/notifications/rules:
 *   get:
 *     tags: [Notifications]
 *     summary: List notification rules for this tenant
 *     responses:
 *       200:
 *         description: Array of notification rules sorted by eventType and role
 */
router.get("/rules", async (req: Request, res: Response) => {
  try {
    const rules = await prisma.notificationRule.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: [{ eventType: "asc" }, { role: "asc" }],
    });
    res.json(rules);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/notifications/stream:
 *   get:
 *     tags: [Notifications]
 *     summary: SSE stream for real-time notification delivery
 *     description: Server-Sent Events endpoint. Sends unread_count on connect, then pushes new notifications and heartbeats every 10s.
 *     responses:
 *       200:
 *         description: SSE event stream (Content-Type text/event-stream)
 */
router.get("/stream", (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const tenantId = req.user!.tenantId;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let lastChecked = new Date();

  // Send initial unread count
  prisma.notification.count({
    where: { tenantId, userId, read: false },
  }).then((count) => {
    res.write(`data: ${JSON.stringify({ type: "unread_count", count })}\n\n`);
  }).catch((err) => { logger.warn({ err }, "notifications SSE initial unread_count failed"); });

  // Poll for new notifications every 10 seconds (much less expensive than client polling)
  const interval = setInterval(async () => {
    try {
      const newNotifications = await prisma.notification.findMany({
        where: { tenantId, userId, createdAt: { gt: lastChecked } },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      if (newNotifications.length > 0) {
        lastChecked = new Date();
        res.write(`data: ${JSON.stringify({ type: "notifications", items: newNotifications })}\n\n`);

        // Also send updated unread count
        const count = await prisma.notification.count({ where: { tenantId, userId, read: false } });
        res.write(`data: ${JSON.stringify({ type: "unread_count", count })}\n\n`);
      } else {
        // Heartbeat to keep connection alive
        res.write(`: heartbeat\n\n`);
      }
    } catch {
      // Silently handle DB errors — client will reconnect
    }
  }, 10000);

  // Clean up on disconnect
  req.on("close", () => {
    clearInterval(interval);
  });
});

/**
 * @swagger
 * /api/notifications/rules:
 *   put:
 *     tags: [Notifications]
 *     summary: Upsert a notification rule (enable/disable per event type and role)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [eventType, role, enabled]
 *             properties:
 *               eventType: { type: string }
 *               role: { type: string }
 *               enabled: { type: boolean }
 *     responses:
 *       200:
 *         description: Upserted notification rule
 */
router.put("/rules", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { eventType, role, enabled } = req.body;

    const rule = await prisma.notificationRule.upsert({
      where: {
        tenantId_eventType_role: { tenantId, eventType, role },
      },
      update: { enabled },
      create: { tenantId, eventType, role, enabled },
    });
    res.json(rule);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
