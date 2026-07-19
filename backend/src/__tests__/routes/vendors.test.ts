// Darb 2.0 — staff-facing /api/vendors route tests (plan §A8).
//
// Focus: branch create/update resolves zoneId INLINE (bbox prefilter +
// @turf/boolean-point-in-polygon) against active DeliveryZone rows, plus the
// vendor-code normalization and wallet 3dp serialization contracts.
//
// The default auth mock identity (role ADMIN, tenant test-tenant-id) passes
// the rbac(ADMIN, OPS_MANAGER) gates.

import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();
// Augment the shared prisma stub in-place with the Darb 2.0 delegates
// (parallel-track safety: don't edit mocks/config.ts). resetAllMocks()
// walks Object.entries(prisma), so these are reset per test too.
prisma.vendor = prisma.vendor ?? {
  findFirst: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  updateMany: jest.fn(),
};
prisma.vendorBranch = prisma.vendorBranch ?? {
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  deleteMany: jest.fn(),
};
prisma.deliveryZone = prisma.deliveryZone ?? { findMany: jest.fn() };
prisma.walletAccount = prisma.walletAccount ?? { findFirst: jest.fn() };
prisma.walletEntry = prisma.walletEntry ?? { findMany: jest.fn(), count: jest.fn() };
prisma.user = prisma.user ?? { findUnique: jest.fn(), create: jest.fn() };

import vendorsRouter from "../../routes/vendors";

const app = express();
app.use(express.json());
app.use("/api/vendors", vendorsRouter);

const TENANT = "test-tenant-id"; // default identity from the auth mock

// Simple square zone over Kuwait City: lng 47.9→48.1, lat 29.3→29.5
const SQUARE_ZONE = {
  id: "zone-square",
  polygon: {
    type: "Polygon",
    coordinates: [[[47.9, 29.3], [48.1, 29.3], [48.1, 29.5], [47.9, 29.5], [47.9, 29.3]]],
  },
  bbox: [47.9, 29.3, 48.1, 29.5],
};

// Triangle whose bbox matches the square but excludes the north-west corner.
const TRIANGLE_ZONE = {
  id: "zone-triangle",
  polygon: {
    type: "Polygon",
    coordinates: [[[47.9, 29.3], [48.1, 29.3], [48.1, 29.5], [47.9, 29.3]]],
  },
  bbox: [47.9, 29.3, 48.1, 29.5],
};

describe("Vendors routes", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  // ─── Branch create: inline zone resolution ─────────────────────────────────

  describe("POST /api/vendors/:id/branches — zone resolution", () => {
    beforeEach(() => {
      prisma.vendor.findFirst.mockResolvedValue({ id: "v-1", tenantId: TENANT });
      prisma.vendorBranch.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "b-new", ...data })
      );
    });

    test("point inside the polygon resolves zoneId", async () => {
      prisma.deliveryZone.findMany.mockResolvedValueOnce([SQUARE_ZONE]);

      const res = await request(app)
        .post("/api/vendors/v-1/branches")
        .send({ name: "Main Branch", lat: 29.4, lng: 48.0 });

      expect(res.status).toBe(201);
      expect(prisma.deliveryZone.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT, isActive: true }),
        })
      );
      expect(prisma.vendorBranch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT,
            vendorId: "v-1",
            zoneId: "zone-square",
            lat: 29.4,
            lng: 48.0,
          }),
        })
      );
      expect(res.body.zoneId).toBe("zone-square");
    });

    test("point outside every zone → zoneId null", async () => {
      prisma.deliveryZone.findMany.mockResolvedValueOnce([SQUARE_ZONE]);

      const res = await request(app)
        .post("/api/vendors/v-1/branches")
        .send({ name: "Far Branch", lat: 28.0, lng: 47.0 });

      expect(res.status).toBe(201);
      expect(prisma.vendorBranch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ zoneId: null }),
        })
      );
    });

    test("bbox hit but polygon miss → zoneId null (exact test runs after prefilter)", async () => {
      prisma.deliveryZone.findMany.mockResolvedValueOnce([TRIANGLE_ZONE]);

      // North-west corner: inside the triangle's bbox, outside the triangle.
      await request(app)
        .post("/api/vendors/v-1/branches")
        .send({ name: "NW Branch", lat: 29.49, lng: 47.91 });

      expect(prisma.vendorBranch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ zoneId: null }),
        })
      );
    });

    test("lat/lng are required by the Zod schema", async () => {
      const res = await request(app)
        .post("/api/vendors/v-1/branches")
        .send({ name: "No Coords" });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });
  });

  // ─── Branch update: re-resolution on coordinate change ─────────────────────

  test("PUT /api/vendors/branches/:branchId re-resolves zoneId when coords change", async () => {
    prisma.vendorBranch.findFirst.mockResolvedValueOnce({
      id: "b-1", tenantId: TENANT, vendorId: "v-1", lat: 29.4, lng: 48.0,
    });
    prisma.deliveryZone.findMany.mockResolvedValueOnce([SQUARE_ZONE]);
    prisma.vendorBranch.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: "b-1", ...data })
    );

    // Only lng provided — must merge with the stored lat before resolving.
    const res = await request(app)
      .put("/api/vendors/branches/b-1")
      .send({ lng: 48.05 });

    expect(res.status).toBe(200);
    expect(prisma.vendorBranch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "b-1" },
        data: expect.objectContaining({ lng: 48.05, zoneId: "zone-square" }),
      })
    );
  });

  // ─── Vendor create ─────────────────────────────────────────────────────────

  test("POST /api/vendors uppercases the code and scopes to the tenant", async () => {
    prisma.vendor.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: "v-new", ...data })
    );

    const res = await request(app)
      .post("/api/vendors")
      .send({ name: "Burger Boulevard", code: "brgb" });

    expect(res.status).toBe(201);
    expect(prisma.vendor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: TENANT, code: "BRGB" }),
      })
    );
  });

  // ─── Vendor detail: wallet balance without importing the wallet service ────

  test("GET /api/vendors/:id returns 3dp wallet balance and Foodics status", async () => {
    prisma.vendor.findFirst.mockResolvedValueOnce({
      id: "v-1",
      tenantId: TENANT,
      name: "Burger Boulevard",
      branches: [],
      foodicsConnection: { status: "CONNECTED", orderTagId: "tag-1", lastEventAt: null },
    });
    prisma.walletAccount.findFirst.mockResolvedValueOnce({
      id: "acc-1", ownerType: "VENDOR_PAYABLE", ownerKey: "VENDOR:v-1", balanceKwd: 12.5,
    });

    const res = await request(app).get("/api/vendors/v-1");

    expect(res.status).toBe(200);
    expect(res.body.wallet).toEqual({ balanceKwd: "12.500", accountId: "acc-1" });
    expect(res.body.foodics).toMatchObject({ connected: true, status: "CONNECTED" });
    expect(prisma.walletAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, ownerKey: "VENDOR:v-1" },
      })
    );
  });

  test("GET /api/vendors/:id tolerates a missing FoodicsConnection + wallet", async () => {
    prisma.vendor.findFirst.mockResolvedValueOnce({
      id: "v-1", tenantId: TENANT, name: "Burger Boulevard",
      branches: [], foodicsConnection: null,
    });
    prisma.walletAccount.findFirst.mockResolvedValueOnce(null);

    const res = await request(app).get("/api/vendors/v-1");

    expect(res.status).toBe(200);
    expect(res.body.foodics).toMatchObject({ connected: false, status: null });
    expect(res.body.wallet).toEqual({ balanceKwd: "0.000", accountId: null });
  });

  // ─── Vendor portal user creation ───────────────────────────────────────────

  test("POST /api/vendors/:id/users creates a VENDOR-role user bound to the vendor", async () => {
    prisma.vendor.findFirst.mockResolvedValueOnce({ id: "v-1", tenantId: TENANT });
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.user.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: "u-new", ...data })
    );

    const res = await request(app)
      .post("/api/vendors/v-1/users")
      .send({ email: "owner@brgb.kw", password: "s3cret-pass", name: "Vendor Owner" });

    expect(res.status).toBe(201);
    const created = prisma.user.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      tenantId: TENANT,
      role: "VENDOR",
      vendorId: "v-1",
      email: "owner@brgb.kw",
    });
    // Password is hashed, never stored raw.
    expect(created.passwordHash).toBeDefined();
    expect(created.passwordHash).not.toBe("s3cret-pass");
  });
});
