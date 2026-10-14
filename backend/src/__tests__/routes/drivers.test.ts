import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";
import driversRouter from "../../routes/drivers";

const app = express();
app.use(express.json());
app.use("/api/drivers", driversRouter);

describe("Drivers route integration tests", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  // ─── GET /api/drivers ────────────────────────────────────────────────────

  describe("GET /api/drivers", () => {
    it("returns a paginated response with empty data", async () => {
      const prisma = getMockPrisma();
      prisma.driver.findMany.mockResolvedValueOnce([]);
      prisma.driver.count.mockResolvedValueOnce(0);

      const res = await request(app).get("/api/drivers?platform=TALABAT");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("pagination");
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination).toMatchObject({
        page: 1,
        total: 0,
        totalPages: 0,
      });
    });

    it("returns enriched driver records", async () => {
      const prisma = getMockPrisma();
      const mockDriver = {
        id: "drv-1",
        name: "Ahmed Ali",
        platform: "TALABAT",
        status: "ACTIVE",
        phone: "+96599999999",
        tenantId: "test-tenant-id",
        createdAt: new Date(),
        company: { name: "TestCo", platform: "TALABAT" },
      };
      prisma.driver.findMany.mockResolvedValueOnce([mockDriver]);
      prisma.driver.count.mockResolvedValueOnce(1);

      const res = await request(app).get("/api/drivers");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toHaveProperty("name", "Ahmed Ali");
      expect(res.body.data[0]).toHaveProperty("dailyOrders", 0);
      expect(res.body.pagination.total).toBe(1);
    });

    it("respects pagination parameters", async () => {
      const prisma = getMockPrisma();
      prisma.driver.findMany.mockResolvedValueOnce([]);
      prisma.driver.count.mockResolvedValueOnce(100);

      const res = await request(app).get("/api/drivers?page=3&limit=10");

      expect(res.status).toBe(200);
      expect(res.body.pagination).toMatchObject({
        page: 3,
        limit: 10,
        total: 100,
        totalPages: 10,
      });
      // Verify findMany was called with correct skip/take
      expect(prisma.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
    });
  });

  // ─── GET /api/drivers/:id ────────────────────────────────────────────────

  describe("GET /api/drivers/:id", () => {
    it("returns 404 when driver is not found", async () => {
      const prisma = getMockPrisma();
      prisma.driver.findFirst.mockResolvedValueOnce(null);

      const res = await request(app).get("/api/drivers/nonexistent-id");

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error", "Driver not found");
    });

    it("returns the driver when found", async () => {
      const prisma = getMockPrisma();
      const mockDriver = {
        id: "drv-1",
        name: "Ahmed Ali",
        platform: "TALABAT",
        status: "ACTIVE",
        tenantId: "test-tenant-id",
        company: null,
        inventory: [],
        supervisor: null,
        assignedVehicle: null,
      };
      prisma.driver.findFirst.mockResolvedValueOnce(mockDriver);

      const res = await request(app).get("/api/drivers/drv-1");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id", "drv-1");
      expect(res.body).toHaveProperty("name", "Ahmed Ali");
    });
  });

  // ─── POST /api/drivers ───────────────────────────────────────────────────

  describe("POST /api/drivers", () => {
    const validBody = {
      name: "Fahad Hassan",
      phone: "+96598765432",
      platform: "KEETA",
      companyId: "comp-1",
    };

    it("creates a driver and returns 201", async () => {
      const prisma = getMockPrisma();
      const createdDriver = {
        id: "drv-new",
        ...validBody,
        status: "ACTIVE",
        tenantId: "test-tenant-id",
        inventory: [],
      };

      // The route uses $transaction which receives a callback
      prisma.$transaction.mockImplementationOnce(async (fn: any) => {
        const tx = {
          driver: {
            create: jest.fn().mockResolvedValue({ id: "drv-new", ...validBody }),
            findUnique: jest.fn().mockResolvedValue(createdDriver),
          },
          driverInventory: {
            createMany: jest.fn(),
          },
        };
        return fn(tx);
      });

      const res = await request(app)
        .post("/api/drivers")
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id", "drv-new");
      expect(res.body).toHaveProperty("name", "Fahad Hassan");
    });

    it("returns 400 when required fields are missing", async () => {
      const res = await request(app)
        .post("/api/drivers")
        .send({ name: "Incomplete" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
      expect(res.body).toHaveProperty("details");
      expect(res.body.details.length).toBeGreaterThan(0);
    });

    it("returns 400 when name is too short", async () => {
      const res = await request(app)
        .post("/api/drivers")
        .send({ ...validBody, name: "A" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });

    it("returns 400 for invalid platform", async () => {
      const res = await request(app)
        .post("/api/drivers")
        .send({ ...validBody, platform: "UBER" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });
  });

  // ─── DELETE /api/drivers/:id ─────────────────────────────────────────────

  describe("DELETE /api/drivers/:id", () => {
    it("deletes the driver and returns success message", async () => {
      const prisma = getMockPrisma();
      prisma.driver.deleteMany.mockResolvedValueOnce({ count: 1 });

      const res = await request(app).delete("/api/drivers/drv-1");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message", "Driver deleted");
      expect(prisma.driver.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "drv-1", tenantId: "test-tenant-id" },
        })
      );
    });
  });

  // ─── POST /api/drivers/state/bulk (revision 24 #6) ───────────────────────

  describe("POST /api/drivers/state/bulk", () => {
    it("refuses an unknown verb, including TERMINATE", async () => {
      const res = await request(app)
        .post("/api/drivers/state/bulk")
        .send({ driverIds: ["d1"], action: "TERMINATE" });
      expect(res.status).toBe(400);
    });

    it("answers 200 with a row per driver when one is refused", async () => {
      const prisma = getMockPrisma();
      prisma.driver.findMany.mockResolvedValueOnce([{ id: "d1", name: "Anil" }]);
      prisma.driver.findFirst
        .mockResolvedValueOnce({ id: "d1", inTraining: false, status: "ACTIVE" })
        .mockResolvedValueOnce({ id: "d1", status: "SUSPENDED" });
      prisma.driver.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await request(app)
        .post("/api/drivers/state/bulk")
        .send({ driverIds: ["d1", "missing"], action: "SUSPEND" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ action: "SUSPEND", succeeded: 1, failed: 1 });
      expect(res.body.results[1]).toMatchObject({ driverId: "missing", ok: false, code: "NOT_FOUND" });
    });
  });
});
