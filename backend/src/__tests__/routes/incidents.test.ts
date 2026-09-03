import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";

// eventBus is not covered by moduleNameMapper — mock it here so ack/resolve
// assertions can spy on publishEvent without touching ioredis.
jest.mock("../../services/eventBus", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

import { publishEvent } from "../../services/eventBus";
import incidentsRouter from "../../routes/incidents";

// Augment the shared prisma mock IN-PLACE — mocks/config.ts has no `incident`
// delegate yet and the shared mock file is contended across parallel tracks,
// so the delegate is attached here instead of editing mocks/config.ts.
// resetAllMocks() iterates Object.entries(prisma), so these get reset too.
const prismaMock = getMockPrisma();
if (!prismaMock.incident) {
  prismaMock.incident = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
}

const app = express();
app.use(express.json());
app.use("/api/incidents", incidentsRouter);

// The auth mock only fills req.user when missing, so a pre-router middleware
// can impersonate arbitrary users (same pattern as the decisions route tests).
function appAs(user: Record<string, unknown>) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res: any, next: any) => {
    req.user = user;
    next();
  });
  a.use("/api/incidents", incidentsRouter);
  return a;
}

const baseIncident = {
  id: "inc-1",
  tenantId: "test-tenant-id",
  type: "ACCIDENT",
  status: "OPEN",
  severity: "HIGH",
  driverId: "drv-1",
  orderId: null,
  description: "Courier rear-ended at Hawally roundabout",
  reportedVia: "PORTAL",
  driver: { id: "drv-1", name: "Ahmed Ali", phone: "+96550000001" },
};

describe("Incidents route integration tests", () => {
  beforeEach(() => {
    resetAllMocks();
    (publishEvent as jest.Mock).mockClear();
  });

  // ─── GET /api/incidents ──────────────────────────────────────────────────

  describe("GET /api/incidents", () => {
    it("returns a paginated response with empty data", async () => {
      const prisma = getMockPrisma();
      prisma.incident.findMany.mockResolvedValueOnce([]);
      prisma.incident.count.mockResolvedValueOnce(0);

      const res = await request(app).get("/api/incidents");

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination).toMatchObject({ page: 1, total: 0, totalPages: 0 });
    });

    it("scopes to the caller's tenant, applies filters, newest first", async () => {
      const prisma = getMockPrisma();
      prisma.incident.findMany.mockResolvedValueOnce([baseIncident]);
      prisma.incident.count.mockResolvedValueOnce(1);

      const res = await request(app).get(
        "/api/incidents?status=OPEN&type=ACCIDENT&driverId=drv-1&dateFrom=2026-07-01&dateTo=2026-07-19"
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "test-tenant-id",
            status: "OPEN",
            type: "ACCIDENT",
            driverId: "drv-1",
            createdAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
          }),
          orderBy: { createdAt: "desc" },
          include: {
            driver: { select: { id: true, name: true, phone: true } },
            order: { select: { id: true, orderNumber: true, status: true, driverId: true } },
          },
        })
      );
    });

    it("rejects an invalid status filter with 400", async () => {
      const res = await request(app).get("/api/incidents?status=CLOSED");
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/status must be one of/);
    });
  });

  // ─── GET /api/incidents/:id ──────────────────────────────────────────────

  describe("GET /api/incidents/:id", () => {
    it("returns 404 when the incident is not found", async () => {
      const prisma = getMockPrisma();
      prisma.incident.findFirst.mockResolvedValueOnce(null);

      const res = await request(app).get("/api/incidents/nope");

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error", "Incident not found");
    });

    it("returns the incident, queried within the caller's tenant", async () => {
      const prisma = getMockPrisma();
      prisma.incident.findFirst.mockResolvedValueOnce(baseIncident);

      const res = await request(app).get("/api/incidents/inc-1");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id", "inc-1");
      expect(prisma.incident.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inc-1", tenantId: "test-tenant-id" },
        })
      );
    });
  });

  // ─── POST /api/incidents ─────────────────────────────────────────────────

  describe("POST /api/incidents", () => {
    it("creates a staff incident with HIGH severity and PORTAL source", async () => {
      const prisma = getMockPrisma();
      prisma.incident.create.mockResolvedValueOnce(baseIncident);

      const res = await request(app).post("/api/incidents").send({
        type: "ACCIDENT",
        driverId: "drv-1",
        description: "Courier rear-ended at Hawally roundabout",
        latitude: 29.3326,
        longitude: 48.0289,
      });

      expect(res.status).toBe(201);
      expect(prisma.incident.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: "test-tenant-id",
            type: "ACCIDENT",
            driverId: "drv-1",
            severity: "HIGH",
            reportedVia: "PORTAL",
            lat: 29.3326,
            lng: 48.0289,
          }),
        })
      );
    });

    it("forces CRITICAL severity for SOS incidents", async () => {
      const prisma = getMockPrisma();
      prisma.incident.create.mockResolvedValueOnce({ ...baseIncident, type: "SOS", severity: "CRITICAL" });

      const res = await request(app).post("/api/incidents").send({ type: "SOS", driverId: "drv-1" });

      expect(res.status).toBe(201);
      expect(prisma.incident.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: "SOS", severity: "CRITICAL" }),
        })
      );
    });

    it("returns 400 when driverId is missing", async () => {
      const res = await request(app).post("/api/incidents").send({ type: "OTHER" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
      expect(res.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "driverId" })])
      );
    });

    it("returns 400 for an invalid incident type", async () => {
      const res = await request(app).post("/api/incidents").send({ type: "FIRE", driverId: "drv-1" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });

    it("returns 403 for roles below SUPERVISOR", async () => {
      const viewerApp = appAs({ userId: "viewer-1", tenantId: "test-tenant-id", role: "VIEWER" });

      const res = await request(viewerApp).post("/api/incidents").send({ type: "OTHER", driverId: "drv-1" });

      expect(res.status).toBe(403);
    });
  });

  // ─── POST /api/incidents/:id/ack ─────────────────────────────────────────

  describe("POST /api/incidents/:id/ack", () => {
    it("acknowledges an OPEN incident and publishes incident.updated", async () => {
      const prisma = getMockPrisma();
      prisma.incident.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.incident.findFirst.mockResolvedValueOnce({
        ...baseIncident,
        status: "ACKNOWLEDGED",
        acknowledgedById: "test-user-id",
      });

      const res = await request(app).post("/api/incidents/inc-1/ack");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status", "ACKNOWLEDGED");
      // Transition guard lives in the WHERE clause (atomic OPEN→ACKNOWLEDGED)
      expect(prisma.incident.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inc-1", tenantId: "test-tenant-id", status: "OPEN" },
          data: expect.objectContaining({
            status: "ACKNOWLEDGED",
            acknowledgedById: "test-user-id",
            acknowledgedAt: expect.any(Date),
          }),
        })
      );
      expect(publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "incident.updated",
          tenantId: "test-tenant-id",
          payload: expect.objectContaining({ incidentId: "inc-1", status: "ACKNOWLEDGED" }),
        })
      );
    });

    it("returns 409 on double-ack (already ACKNOWLEDGED)", async () => {
      const prisma = getMockPrisma();
      prisma.incident.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.incident.findFirst.mockResolvedValueOnce({ id: "inc-1", status: "ACKNOWLEDGED" });

      const res = await request(app).post("/api/incidents/inc-1/ack");

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/ACKNOWLEDGED/);
      expect(publishEvent).not.toHaveBeenCalled();
    });

    it("returns 409 when the incident is already RESOLVED", async () => {
      const prisma = getMockPrisma();
      prisma.incident.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.incident.findFirst.mockResolvedValueOnce({ id: "inc-1", status: "RESOLVED" });

      const res = await request(app).post("/api/incidents/inc-1/ack");

      expect(res.status).toBe(409);
    });

    it("returns 404 when the incident does not exist", async () => {
      const prisma = getMockPrisma();
      prisma.incident.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.incident.findFirst.mockResolvedValueOnce(null);

      const res = await request(app).post("/api/incidents/nope/ack");

      expect(res.status).toBe(404);
      expect(publishEvent).not.toHaveBeenCalled();
    });

    it("returns 403 for roles below SUPERVISOR", async () => {
      const viewerApp = appAs({ userId: "viewer-1", tenantId: "test-tenant-id", role: "ACCOUNTANT" });

      const res = await request(viewerApp).post("/api/incidents/inc-1/ack");

      expect(res.status).toBe(403);
    });
  });

  // ─── POST /api/incidents/:id/resolve ─────────────────────────────────────

  describe("POST /api/incidents/:id/resolve", () => {
    it("resolves an OPEN incident with a resolution note", async () => {
      const prisma = getMockPrisma();
      prisma.incident.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.incident.findFirst.mockResolvedValueOnce({
        ...baseIncident,
        status: "RESOLVED",
        resolvedById: "test-user-id",
        resolutionNote: "Driver picked up, vehicle towed",
      });

      const res = await request(app)
        .post("/api/incidents/inc-1/resolve")
        .send({ resolutionNote: "Driver picked up, vehicle towed" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status", "RESOLVED");
      // Allowed from BOTH OPEN and ACKNOWLEDGED — enforced by the IN clause
      expect(prisma.incident.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "inc-1",
            tenantId: "test-tenant-id",
            status: { in: ["OPEN", "ACKNOWLEDGED"] },
          },
          data: expect.objectContaining({
            status: "RESOLVED",
            resolvedById: "test-user-id",
            resolvedAt: expect.any(Date),
            resolutionNote: "Driver picked up, vehicle towed",
          }),
        })
      );
      expect(publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "incident.updated",
          tenantId: "test-tenant-id",
          payload: expect.objectContaining({ incidentId: "inc-1", status: "RESOLVED" }),
        })
      );
    });

    it("resolves an ACKNOWLEDGED incident (note optional)", async () => {
      const prisma = getMockPrisma();
      prisma.incident.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.incident.findFirst.mockResolvedValueOnce({
        ...baseIncident,
        status: "RESOLVED",
        acknowledgedById: "test-user-id",
        resolvedById: "test-user-id",
      });

      const res = await request(app).post("/api/incidents/inc-1/resolve").send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status", "RESOLVED");
      expect(publishEvent).toHaveBeenCalledTimes(1);
    });

    it("returns 409 when the incident is already RESOLVED", async () => {
      const prisma = getMockPrisma();
      prisma.incident.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.incident.findFirst.mockResolvedValueOnce({ id: "inc-1", status: "RESOLVED" });

      const res = await request(app).post("/api/incidents/inc-1/resolve").send({});

      expect(res.status).toBe(409);
      expect(publishEvent).not.toHaveBeenCalled();
    });

    it("returns 404 when the incident does not exist", async () => {
      const prisma = getMockPrisma();
      prisma.incident.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.incident.findFirst.mockResolvedValueOnce(null);

      const res = await request(app).post("/api/incidents/nope/resolve").send({});

      expect(res.status).toBe(404);
    });
  });

  // ─── Tenant scoping ──────────────────────────────────────────────────────

  describe("tenant scoping", () => {
    const tenantB = { userId: "user-b", tenantId: "tenant-b", role: "ADMIN", email: "b@darb.com" };

    it("lists only the caller tenant's incidents", async () => {
      const prisma = getMockPrisma();
      prisma.incident.findMany.mockResolvedValueOnce([]);
      prisma.incident.count.mockResolvedValueOnce(0);

      const res = await request(appAs(tenantB)).get("/api/incidents");

      expect(res.status).toBe(200);
      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-b" }) })
      );
      expect(prisma.incident.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-b" }) })
      );
    });

    it("cannot ack another tenant's incident (scoped WHERE → 404)", async () => {
      const prisma = getMockPrisma();
      // Incident inc-1 belongs to test-tenant-id, so tenant-b's scoped
      // updateMany matches nothing and the scoped findFirst sees nothing.
      prisma.incident.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.incident.findFirst.mockResolvedValueOnce(null);

      const res = await request(appAs(tenantB)).post("/api/incidents/inc-1/ack");

      expect(res.status).toBe(404);
      expect(prisma.incident.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: "tenant-b" }),
        })
      );
      expect(prisma.incident.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: "tenant-b" }),
        })
      );
      expect(publishEvent).not.toHaveBeenCalled();
    });

    it("cannot fetch another tenant's incident detail", async () => {
      const prisma = getMockPrisma();
      prisma.incident.findFirst.mockResolvedValueOnce(null);

      const res = await request(appAs(tenantB)).get("/api/incidents/inc-1");

      expect(res.status).toBe(404);
      expect(prisma.incident.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "inc-1", tenantId: "tenant-b" } })
      );
    });
  });
});
