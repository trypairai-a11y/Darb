import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";
import companiesRouter from "../../routes/companies";

const app = express();
app.use(express.json());
app.use("/api/companies", companiesRouter);

describe("Companies route integration tests", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  // ─── GET /api/companies ──────────────────────────────────────────────────

  describe("GET /api/companies", () => {
    it("returns a paginated response with empty data", async () => {
      const prisma = getMockPrisma();
      prisma.company.findMany.mockResolvedValueOnce([]);
      prisma.company.count.mockResolvedValueOnce(0);

      const res = await request(app).get("/api/companies");

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

    it("returns company records with driver count", async () => {
      const prisma = getMockPrisma();
      const mockCompany = {
        id: "comp-1",
        name: "FastFleet Kuwait",
        platform: "TALABAT",
        tenantId: "test-tenant-id",
        _count: { drivers: 12 },
      };
      prisma.company.findMany.mockResolvedValueOnce([mockCompany]);
      prisma.company.count.mockResolvedValueOnce(1);

      const res = await request(app).get("/api/companies");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toHaveProperty("name", "FastFleet Kuwait");
      expect(res.body.data[0]._count.drivers).toBe(12);
    });

    it("filters by platform query parameter", async () => {
      const prisma = getMockPrisma();
      prisma.company.findMany.mockResolvedValueOnce([]);
      prisma.company.count.mockResolvedValueOnce(0);

      await request(app).get("/api/companies?platform=KEETA");

      expect(prisma.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ platform: "KEETA" }),
        })
      );
    });
  });

  // ─── GET /api/companies/:id ──────────────────────────────────────────────

  describe("GET /api/companies/:id", () => {
    it("returns 404 when company is not found", async () => {
      const prisma = getMockPrisma();
      prisma.company.findFirst.mockResolvedValueOnce(null);

      const res = await request(app).get("/api/companies/nonexistent-id");

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error", "Company not found");
    });

    it("returns the company when found", async () => {
      const prisma = getMockPrisma();
      const mockCompany = {
        id: "comp-1",
        name: "FastFleet Kuwait",
        platform: "TALABAT",
        tenantId: "test-tenant-id",
        _count: { drivers: 5, vehicles: 3 },
      };
      prisma.company.findFirst.mockResolvedValueOnce(mockCompany);

      const res = await request(app).get("/api/companies/comp-1");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id", "comp-1");
      expect(res.body).toHaveProperty("name", "FastFleet Kuwait");
    });
  });

  // ─── POST /api/companies ─────────────────────────────────────────────────

  describe("POST /api/companies", () => {
    const validBody = {
      name: "SpeedLine Co",
      platform: "KEETA",
    };

    it("creates a company and returns 201", async () => {
      const prisma = getMockPrisma();
      const createdCompany = {
        id: "comp-new",
        ...validBody,
        tenantId: "test-tenant-id",
        isActive: true,
      };
      prisma.company.create.mockResolvedValueOnce(createdCompany);

      const res = await request(app)
        .post("/api/companies")
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id", "comp-new");
      expect(res.body).toHaveProperty("name", "SpeedLine Co");
    });

    it("returns 400 when name is missing", async () => {
      const res = await request(app)
        .post("/api/companies")
        .send({ platform: "KEETA" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "name" }),
        ])
      );
    });

    // Client revision #16 removed the Platform column and the platform picker
    // from the Add Company form. The column stays on the model for the legacy
    // platform reports, so creation defaults it instead of demanding it.
    it("defaults the platform when it is omitted", async () => {
      const prisma = getMockPrisma();
      prisma.company.create.mockResolvedValueOnce({ id: "c-noplat", name: "NoPlat Co" });

      const res = await request(app)
        .post("/api/companies")
        .send({ name: "NoPlat Co" });

      expect(res.status).toBe(201);
      expect(prisma.company.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: "NoPlat Co", platform: "KEETA" }),
        })
      );
    });

    it("returns 400 for invalid platform value", async () => {
      const res = await request(app)
        .post("/api/companies")
        .send({ name: "BadPlat Co", platform: "UBER" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });
  });

  // ─── DELETE /api/companies/:id ───────────────────────────────────────────

  describe("DELETE /api/companies/:id", () => {
    it("deletes the company and returns success message", async () => {
      const prisma = getMockPrisma();
      prisma.company.deleteMany.mockResolvedValueOnce({ count: 1 });

      const res = await request(app).delete("/api/companies/comp-1");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message", "Company deleted");
      expect(prisma.company.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "comp-1", tenantId: "test-tenant-id" },
        })
      );
    });
  });
});
