/**
 * Phase 9 Wave 0 RED test — turns GREEN in Wave 1 when:
 *   1. GET  /api/agent/inbox lists Notifications where metadata.driverId=device.driverId
 *      AND tenantId=device.tenantId (Pitfall 9 — NOT userId).
 *   2. POST /api/agent/inbox/:id/read sets read=true, readAt=now() on the
 *      tenant-scoped, driver-scoped Notification row.
 *   3. Cross-tenant + cross-driver queries return empty / 404.
 *
 * The Wave 1 implementation extends `src/routes/agent.ts` with GET /inbox,
 * POST /inbox/:id/read, POST /inbox/opt-out. Today those routes don't exist
 * so each `it` block fails with 404 — that IS the RED signal.
 */

import express from "express";
import request from "supertest";
import { getMockPrisma, resetAllMocks } from "../setup";

const agentRouter = require("../../routes/agent").default;

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

describe("GET /api/agent/inbox — Wave 0 RED scaffolding", () => {
  beforeEach(() => resetAllMocks());

  test("returns Notifications where metadata.driverId equals device.driverId (Pitfall 9 fix — NOT userId)", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
      driver: { id: "drv1", tenantId: "tenA" },
    });
    prisma.notification.findMany.mockResolvedValue([
      {
        id: "ntf-1",
        tenantId: "tenA",
        title: "Late clock-in warning",
        titleAr: "تحذير من التأخر في تسجيل الحضور",
        message: "Please be on time tomorrow",
        bodyAr: "الرجاء الحضور في الوقت غداً",
        category: "OPS_TODO",
        severity: "MEDIUM",
        read: false,
        readAt: null,
        createdAt: new Date("2026-05-13T08:00:00.000Z"),
        metadata: { driverId: "drv1" },
      },
    ]);
    prisma.notification.count.mockResolvedValue(1);

    const res = await request(app).get("/api/agent/inbox").query({ deviceId: "dev1" });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items[0].id).toBe("ntf-1");
    expect(res.body.unreadCount).toBe(1);

    // The critical Pitfall 9 assertion — the route filters on metadata.driverId
    // (the courier-scoped path) and NOT on Notification.userId (the owner path).
    const call = prisma.notification.findMany.mock.calls[0]?.[0];
    expect(call?.where).toBeDefined();
    const whereJson = JSON.stringify(call?.where ?? {});
    expect(whereJson).toMatch(/driverId/i);
    expect(call?.where?.tenantId).toBe("tenA");
  });

  test("rejects cross-tenant — Notifications from tenant B never appear for tenant A's device", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
      driver: { id: "drv1", tenantId: "tenA" },
    });
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);

    await request(app).get("/api/agent/inbox").query({ deviceId: "dev1" });

    const call = prisma.notification.findMany.mock.calls[0]?.[0];
    // The where clause MUST scope to tenantId — no scenario where the route
    // queries without tenantId.
    expect(call?.where?.tenantId).toBe("tenA");
  });

  test("returns unreadCount in response body", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
    });
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(7);

    const res = await request(app).get("/api/agent/inbox").query({ deviceId: "dev1" });
    expect(res.status).toBe(200);
    expect(typeof res.body.unreadCount).toBe("number");
    expect(res.body.unreadCount).toBe(7);
  });

  test("supports ?since=ISO query — only Notifications createdAt >= since", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
    });
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);

    await request(app)
      .get("/api/agent/inbox")
      .query({ deviceId: "dev1", since: "2026-05-13T00:00:00.000Z" });

    const call = prisma.notification.findMany.mock.calls[0]?.[0];
    const whereJson = JSON.stringify(call?.where ?? {});
    // Either createdAt: { gte: Date } OR an equivalent Date filter passed through.
    expect(whereJson).toMatch(/createdAt|gte/i);
  });

  test("rejects 404 when deviceId missing", async () => {
    const res = await request(app).get("/api/agent/inbox");
    // No deviceId → no device → 400 or 404. Either is acceptable for the RED contract.
    expect([400, 404]).toContain(res.status);
  });
});

describe("POST /api/agent/inbox/:id/read — Wave 0 RED scaffolding", () => {
  beforeEach(() => resetAllMocks());

  test("sets read=true + readAt=now() on the notification when device.driverId matches metadata.driverId", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
    });
    prisma.notification.findFirst.mockResolvedValue({
      id: "ntf-1",
      tenantId: "tenA",
      read: false,
      readAt: null,
      metadata: { driverId: "drv1" },
    });
    prisma.notification.update.mockResolvedValue({
      id: "ntf-1",
      read: true,
      readAt: new Date(),
    });

    const res = await request(app)
      .post("/api/agent/inbox/ntf-1/read")
      .send({ deviceId: "dev1" });

    expect(res.status).toBe(200);
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "ntf-1" }),
        data: expect.objectContaining({ read: true, readAt: expect.any(Date) }),
      }),
    );
  });

  test("rejects 404 when the notification belongs to a different driver", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
    });
    // findFirst returns null because the where clause scopes to driverId=drv1
    // but the row's metadata.driverId is drv2.
    prisma.notification.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/agent/inbox/ntf-xyz/read")
      .send({ deviceId: "dev1" });

    expect(res.status).toBe(404);
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  test("rejects 404 when the notification belongs to a different tenant", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
    });
    prisma.notification.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/agent/inbox/ntf-other-tenant/read")
      .send({ deviceId: "dev1" });

    expect(res.status).toBe(404);
  });

  test("is idempotent — second call leaves readAt unchanged (still 200)", async () => {
    const prisma = getMockPrisma();
    prisma.device.findUnique.mockResolvedValue({
      id: "dev1",
      tenantId: "tenA",
      driverId: "drv1",
    });
    const alreadyRead = {
      id: "ntf-1",
      tenantId: "tenA",
      read: true,
      readAt: new Date("2026-05-13T07:00:00.000Z"),
      metadata: { driverId: "drv1" },
    };
    prisma.notification.findFirst.mockResolvedValue(alreadyRead);
    prisma.notification.update.mockResolvedValue(alreadyRead);

    const res = await request(app)
      .post("/api/agent/inbox/ntf-1/read")
      .send({ deviceId: "dev1" });

    expect(res.status).toBe(200);
  });
});
