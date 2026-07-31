// Darb 2.0 revision 12 — the fleet portal's request desk.
//
// Contract under test, in one sentence: THE FLEET PORTAL NEVER WRITES A LIVE
// RECORD. Submitting a driver creates a request and no Driver row; approving
// is the only thing that creates one; and every read/write is scoped by the
// fleetPartnerId on the signed JWT, never from the body or the query.
//
// The one deliberate exception is PATCH /drivers/:id/phone, which writes
// straight through. It has its own test, because an exception that stops being
// exercised is an exception that quietly becomes the rule.
//
// House pattern: getMockPrisma() from ../setup, delegates attached per-suite,
// rbac + fleetScope run for real, supertest for the auth boundaries.

import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();

prisma.fleetPartner = prisma.fleetPartner ?? {
  findFirst: jest.fn(),
  findMany: jest.fn(),
};
prisma.driver = prisma.driver ?? {
  findFirst: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
};
prisma.driver.update = prisma.driver.update ?? jest.fn();
prisma.deliveryOrder = prisma.deliveryOrder ?? { findMany: jest.fn() };
prisma.fleetDocument = prisma.fleetDocument ?? {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
};
prisma.fleetChangeRequest = prisma.fleetChangeRequest ?? {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
};
prisma.fleetIssue = prisma.fleetIssue ?? {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  updateMany: jest.fn(),
  count: jest.fn(),
};
prisma.supportTicket = prisma.supportTicket ?? {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
};
prisma.supportTicketMessage = prisma.supportTicketMessage ?? { create: jest.fn() };
// Revision 13 (#6) — the router resolves the caller's role, tab list and
// company scope from their User row on every request rather than from the JWT.
// An unmocked read means every route below 500s, so the model is stubbed here;
// resetAllMocks leaves it answering undefined, which is the inherit case and is
// exactly how every fleet login that existed before revision 13 behaves.
prisma.user = prisma.user ?? {
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};
prisma.orderRating = prisma.orderRating ?? {
  aggregate: jest.fn(),
  groupBy: jest.fn(),
};

// The notification fan-out is a different subsystem's contract. Mock the
// boundary so a request test does not assert on notification rows.
jest.mock("../../services/notificationService", () => ({
  createViolationNotifications: jest.fn().mockResolvedValue(undefined),
}));

import fleetPortalRouter from "../../routes/fleetPortal";

const FLEET_USER = {
  userId: "u-fleet",
  tenantId: "t-1",
  role: "FLEET",
  email: "ops@sidra.kw",
  fleetPartnerId: "f-1",
};

function makeApp(user: Record<string, unknown> | null = FLEET_USER) {
  const app = express();
  app.use(express.json());
  if (user) {
    app.use((req: any, _res, next) => { req.user = user; next(); });
  }
  app.use("/api/fleet", fleetPortalRouter);
  return app;
}

const OWN_DRIVER = {
  id: "d-1",
  tenantId: "t-1",
  fleetPartnerId: "f-1",
  name: "Abdul Rahman",
  phone: "+96555881284",
  status: "ACTIVE",
  vehicleType: "CAR",
  driverCode: "DRB-0001",
  zone: null,
  hireDate: new Date("2026-01-01"),
  performanceTier: null,
  throttledUntil: null,
  civilIdExpiry: null, civilIdStatus: null,
  drivingLicenseExpiry: null, drivingLicenseStatus: null,
  vehicleRegExpiry: null, vehicleRegStatus: null,
  vehicleInsuranceExpiry: null, vehicleInsuranceStatus: null,
  healthCertExpiry: null, healthCertStatus: null,
  workPermitExpiry: null, workPermitStatus: null,
  foodHandlingCertExpiry: null, foodHandlingCertStatus: null,
};

describe("Fleet portal request desk", () => {
  beforeEach(() => {
    resetAllMocks();
    prisma.fleetPartner.findFirst.mockResolvedValue({ id: "f-1", name: "Sidra Delivery Co" });
    prisma.fleetChangeRequest.create.mockImplementation(async ({ data }: any) => ({
      id: "req-1",
      ...data,
    }));
    prisma.fleetDocument.create.mockImplementation(async ({ data }: any) => ({
      id: "doc-1",
      ...data,
    }));
  });

  // ─── Access control ──────────────────────────────────────────────────────

  test("a staff (ADMIN) token with no ?fleetPartnerId is refused", async () => {
    const res = await request(makeApp(null)).get("/api/fleet/issues");
    expect(res.status).toBe(403);
  });

  test("an inspecting ADMIN is read-only: writes are refused by fleetScope", async () => {
    const admin = { userId: "u-a", tenantId: "t-1", role: "ADMIN", email: "a@darb.kw" };
    prisma.fleetPartner.findFirst.mockResolvedValue({ id: "f-1" });
    const res = await request(makeApp(admin))
      .post("/api/fleet/drivers?fleetPartnerId=f-1")
      .send({ name: "New Driver", phone: "+96599999999", vehicleType: "CAR" });
    expect(res.status).toBe(403);
    expect(prisma.fleetChangeRequest.create).not.toHaveBeenCalled();
  });

  test("a FLEET token with no fleetPartnerId gets 403, not somebody else's fleet", async () => {
    const app = makeApp({ ...FLEET_USER, fleetPartnerId: undefined });
    const res = await request(app).get("/api/fleet/issues");
    expect(res.status).toBe(403);
  });

  // ─── Containment: another fleet's records ────────────────────────────────

  test("a driver belonging to another fleet is a 404, not a 403", async () => {
    // findFirst is called with fleetPartnerId from the token, so a foreign
    // driver simply does not match. Indistinguishable from one that does not
    // exist, which is the point: no enumeration signal.
    prisma.driver.findFirst.mockResolvedValue(null);
    const res = await request(makeApp()).get("/api/fleet/drivers/d-other");
    expect(res.status).toBe(404);
    expect(prisma.driver.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "t-1", fleetPartnerId: "f-1" }),
      }),
    );
  });

  test("acknowledging another fleet's issue changes nothing (updateMany count 0)", async () => {
    prisma.fleetIssue.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(makeApp()).post("/api/fleet/issues/i-other/acknowledge");
    expect(res.status).toBe(409);
    expect(prisma.fleetIssue.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "t-1", fleetPartnerId: "f-1" }),
      }),
    );
  });

  // ─── Submitting a driver creates NO Driver row ───────────────────────────

  test("POST /drivers opens a request and creates no driver", async () => {
    prisma.driver.findFirst.mockResolvedValue(null); // no phone clash
    const res = await request(makeApp())
      .post("/api/fleet/drivers")
      .send({ name: "Bilal Hussain", phone: "+96562697534", vehicleType: "CAR" });

    expect(res.status).toBe(201);
    expect(prisma.driver.create).not.toHaveBeenCalled();
    expect(prisma.fleetChangeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // No `status` is written: PENDING is the column default, so a request
        // cannot be created already-approved by a stray body field.
        data: expect.objectContaining({
          type: "DRIVER_ONBOARD",
          fleetPartnerId: "f-1",
          driverId: null,
        }),
      }),
    );
  });

  test("the fleetPartnerId in the body is ignored; the token's wins", async () => {
    prisma.driver.findFirst.mockResolvedValue(null);
    await request(makeApp())
      .post("/api/fleet/drivers")
      .send({
        name: "Bilal Hussain",
        phone: "+96562697534",
        vehicleType: "CAR",
        fleetPartnerId: "f-somebody-else",
      });

    expect(prisma.fleetChangeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fleetPartnerId: "f-1" }),
      }),
    );
  });

  test("a phone already on the road is a 409, not a second driver", async () => {
    prisma.driver.findFirst.mockResolvedValue({ id: "d-existing" });
    const res = await request(makeApp())
      .post("/api/fleet/drivers")
      .send({ name: "Bilal Hussain", phone: "+96562697534", vehicleType: "CAR" });
    expect(res.status).toBe(409);
    expect(prisma.fleetChangeRequest.create).not.toHaveBeenCalled();
  });

  // ─── Status changes are requests, never writes ───────────────────────────

  test("reporting a resignation writes a request, not the driver row", async () => {
    prisma.driver.findFirst.mockResolvedValue(OWN_DRIVER);
    const res = await request(makeApp())
      .post("/api/fleet/drivers/d-1/requests")
      .send({
        type: "DRIVER_STATUS",
        status: "TERMINATED",
        reason: "Left the company",
        lastWorkingDate: "2026-08-14",
      });

    expect(res.status).toBe(201);
    expect(prisma.driver.update).not.toHaveBeenCalled();
    expect(prisma.fleetChangeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "DRIVER_STATUS", driverId: "d-1" }),
      }),
    );
  });

  // ─── Revision 13 (#4, #5): the dates that make a request actionable ──────

  test("a resignation with no last working date is refused", async () => {
    prisma.driver.findFirst.mockResolvedValue(OWN_DRIVER);
    const res = await request(makeApp())
      .post("/api/fleet/drivers/d-1/requests")
      .send({ type: "DRIVER_STATUS", status: "TERMINATED", reason: "Left" });
    expect(res.status).toBe(400);
    expect(prisma.fleetChangeRequest.create).not.toHaveBeenCalled();
  });

  test("leave carries both ends of it, and they reach the payload", async () => {
    prisma.driver.findFirst.mockResolvedValue(OWN_DRIVER);
    const res = await request(makeApp())
      .post("/api/fleet/drivers/d-1/requests")
      .send({
        type: "DRIVER_STATUS",
        status: "LEAVE",
        leaveStartDate: "2026-08-01",
        returnDate: "2026-08-20",
      });

    expect(res.status).toBe(201);
    expect(prisma.fleetChangeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            status: "LEAVE",
            leaveStartDate: "2026-08-01",
            returnDate: "2026-08-20",
          }),
        }),
      }),
    );
  });

  test("leave with no return date is refused: Darb cannot plan around it", async () => {
    prisma.driver.findFirst.mockResolvedValue(OWN_DRIVER);
    const res = await request(makeApp())
      .post("/api/fleet/drivers/d-1/requests")
      .send({ type: "DRIVER_STATUS", status: "LEAVE", leaveStartDate: "2026-08-01" });
    expect(res.status).toBe(400);
    expect(prisma.fleetChangeRequest.create).not.toHaveBeenCalled();
  });

  test("a return date before the leave date is refused", async () => {
    prisma.driver.findFirst.mockResolvedValue(OWN_DRIVER);
    const res = await request(makeApp())
      .post("/api/fleet/drivers/d-1/requests")
      .send({
        type: "DRIVER_STATUS",
        status: "LEAVE",
        leaveStartDate: "2026-08-20",
        returnDate: "2026-08-01",
      });
    expect(res.status).toBe(400);
    expect(prisma.fleetChangeRequest.create).not.toHaveBeenCalled();
  });

  test("coming back to ACTIVE needs no dates", async () => {
    prisma.driver.findFirst.mockResolvedValue(OWN_DRIVER);
    const res = await request(makeApp())
      .post("/api/fleet/drivers/d-1/requests")
      .send({ type: "DRIVER_STATUS", status: "ACTIVE" });
    expect(res.status).toBe(201);
  });

  test("a status the fleet may not ask for is refused", async () => {
    prisma.driver.findFirst.mockResolvedValue(OWN_DRIVER);
    const res = await request(makeApp())
      .post("/api/fleet/drivers/d-1/requests")
      .send({ type: "DRIVER_STATUS", status: "SUSPENDED" });
    expect(res.status).toBe(400);
    expect(prisma.fleetChangeRequest.create).not.toHaveBeenCalled();
  });

  test("a driver document carries its own type, not the request's", async () => {
    // Regression: `type` names the KIND of request on this endpoint, so the
    // document's type travels as `documentType`. Reading `type` here would
    // have labelled every driver document "DRIVER_DOCUMENT".
    prisma.driver.findFirst.mockResolvedValue(OWN_DRIVER);
    const res = await request(makeApp())
      .post("/api/fleet/drivers/d-1/requests")
      .send({ type: "DRIVER_DOCUMENT", documentType: "CIVIL_ID", expiryDate: "2027-01-01" });

    expect(res.status).toBe(201);
    expect(prisma.fleetDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "CIVIL_ID", driverId: "d-1" }),
      }),
    );
  });

  // ─── The one direct write ────────────────────────────────────────────────

  test("PATCH /drivers/:id/phone writes straight through (the named exception)", async () => {
    prisma.driver.findFirst
      .mockResolvedValueOnce(OWN_DRIVER) // ownership
      .mockResolvedValueOnce(null); // no clash
    prisma.driver.update.mockResolvedValue({
      id: "d-1", name: "Abdul Rahman", phone: "+96599990000",
    });

    const res = await request(makeApp())
      .patch("/api/fleet/drivers/d-1/phone")
      .send({ phone: "+96599990000" });

    expect(res.status).toBe(200);
    expect(prisma.driver.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d-1" },
        data: { phone: "+96599990000" },
      }),
    );
    // Still no request: this is the exception, so nothing goes to review.
    expect(prisma.fleetChangeRequest.create).not.toHaveBeenCalled();
  });

  test("a phone another driver already holds is a 409", async () => {
    prisma.driver.findFirst
      .mockResolvedValueOnce(OWN_DRIVER)
      .mockResolvedValueOnce({ id: "d-2" });
    const res = await request(makeApp())
      .patch("/api/fleet/drivers/d-1/phone")
      .send({ phone: "+96599990000" });
    expect(res.status).toBe(409);
    expect(prisma.driver.update).not.toHaveBeenCalled();
  });

  // ─── Issues ──────────────────────────────────────────────────────────────

  test("resolving an issue without saying what was done is refused", async () => {
    // An acknowledge button with no account of the fix is a button that gets
    // clicked to clear a badge.
    const res = await request(makeApp())
      .post("/api/fleet/issues/i-1/resolve")
      .send({ note: "ok" });
    expect(res.status).toBe(400);
    expect(prisma.fleetIssue.updateMany).not.toHaveBeenCalled();
  });

  test("resolving with a note records who closed it and what they did", async () => {
    prisma.fleetIssue.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(makeApp())
      .post("/api/fleet/issues/i-1/resolve")
      .send({ note: "Called Abdul, his bike was in for service. Back tomorrow." });

    expect(res.status).toBe(200);
    expect(prisma.fleetIssue.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "RESOLVED",
          resolvedById: "u-fleet",
          resolutionNote: "Called Abdul, his bike was in for service. Back tomorrow.",
        }),
      }),
    );
  });

  // ─── Storage fails closed, it does not 500 ───────────────────────────────

  test("upload-url answers STORAGE_NOT_CONFIGURED when R2 is not wired up", async () => {
    const saved = process.env.R2_ENDPOINT;
    delete process.env.R2_ENDPOINT;
    const res = await request(makeApp())
      .post("/api/fleet/documents/upload-url")
      .send({ type: "TRADE_LICENSE", contentType: "application/pdf" });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("STORAGE_NOT_CONFIGURED");
    if (saved !== undefined) process.env.R2_ENDPOINT = saved;
  });

  // ─── Support ─────────────────────────────────────────────────────────────

  test("a support ticket is filed against the fleet, with no vendorId", async () => {
    prisma.supportTicket.create.mockResolvedValue({ id: "tk-1", messages: [] });
    const res = await request(makeApp())
      .post("/api/fleet/support")
      .send({ subject: "Payout query", body: "Last month's statement looks short." });

    expect(res.status).toBe(201);
    expect(prisma.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fleetPartnerId: "f-1", vendorId: null }),
      }),
    );
  });
});
