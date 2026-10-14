// Revision 24 (#8, #11) — the private shift endpoints' boundaries.
//
// Staff: prices are ADMIN's (vehicle plans and rates), planning is
// OPS_MANAGER+, and a SUPERVISOR may read but not plan. Driver app: a start
// away from the shop answers 409 NOT_AT_VENDOR with the distance, so the app
// can say how far off the driver is.

import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";

jest.mock("../../services/privateShifts/privateShiftService", () => {
  const actual = jest.requireActual("../../services/privateShifts/privateShiftService");
  return {
    ...actual,
    saveVendorVehiclePlans: jest.fn().mockResolvedValue({ ok: true }),
    createPrivateShiftPlan: jest.fn().mockResolvedValue({ id: "plan-1", shifts: [] }),
    listPrivateShifts: jest.fn().mockResolvedValue({ data: [], drafts: [] }),
    startPrivateShift: jest.fn(),
  };
});
jest.mock("../../routes/agent", () => ({
  resolveDriverFromAgentRequest: jest.fn(),
}));

const prisma = getMockPrisma();
const service = require("../../services/privateShifts/privateShiftService");
const { resolveDriverFromAgentRequest } = require("../../routes/agent");
const staffRouter = require("../../routes/privateShifts").default;
const agentRouter = require("../../routes/agentPrivateShifts").default;

function staffApp(role: string) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: "u-1", tenantId: "t-1", role, email: "x@darb.kw" };
    next();
  });
  app.use("/api/private-shifts", staffRouter);
  return app;
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
});

describe("staff private shifts", () => {
  test("a supervisor reads but cannot plan", async () => {
    const app = staffApp("SUPERVISOR");
    await request(app).get("/api/private-shifts?from=2026-10-14&to=2026-10-14").expect(200);
    await request(app).post("/api/private-shifts/plans").send({}).expect(403);
    expect(service.createPrivateShiftPlan).not.toHaveBeenCalled();
  });

  test("an ops manager plans, as ADMIN source, on their own tenant", async () => {
    await request(staffApp("OPS_MANAGER"))
      .post("/api/private-shifts/plans")
      .send({ vendorId: "v-1", branchId: "br-1", vehicleType: "CAR", date: "2026-10-15", count: 2, hours: 4 })
      .expect(201);
    expect(service.createPrivateShiftPlan).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t-1", vendorId: "v-1", source: "ADMIN", createdById: "u-1" }),
    );
  });

  test("vehicle plans are prices: ADMIN only", async () => {
    await request(staffApp("OPS_MANAGER")).put("/api/private-shifts/vendors/v-1/vehicle-plans").send({}).expect(403);
    await request(staffApp("ADMIN"))
      .put("/api/private-shifts/vendors/v-1/vehicle-plans")
      .send({ suitableVehicleTypes: ["CAR"], plans: [] })
      .expect(200);
  });

  test("the eligibility checkbox writes the one flag, tenant-scoped", async () => {
    prisma.driver.updateMany.mockResolvedValue({ count: 1 });
    await request(staffApp("OPS_MANAGER"))
      .patch("/api/private-shifts/drivers/d-1/eligibility")
      .send({ eligible: true })
      .expect(200);
    expect(prisma.driver.updateMany).toHaveBeenCalledWith({
      where: { id: "d-1", tenantId: "t-1" },
      data: { privateShiftEligible: true },
    });
    await request(staffApp("OPS_MANAGER")).patch("/api/private-shifts/drivers/d-1/eligibility").send({ eligible: "yes" }).expect(400);
  });
});

describe("driver app", () => {
  function agentApp() {
    const app = express();
    app.use(express.json());
    app.use("/api/agent/private-shifts", agentRouter);
    return app;
  }

  test("starting away from the shop is a 409 carrying the distance", async () => {
    resolveDriverFromAgentRequest.mockResolvedValue({
      driver: { id: "d-1", tenantId: "t-1", vehicleType: "CAR", status: "ACTIVE", privateShiftEligible: true, fleetPartnerId: null },
    });
    service.startPrivateShift.mockRejectedValue(
      new service.PrivateShiftError(409, "NOT_AT_VENDOR", "Go to the shop to start this shift", { distanceM: 420, radiusM: 150 }),
    );
    const res = await request(agentApp())
      .post("/api/agent/private-shifts/ps-1/start")
      .send({ latitude: 29.4, longitude: 47.9 })
      .expect(409);
    expect(res.body).toEqual({ error: "Go to the shop to start this shift", code: "NOT_AT_VENDOR", distanceM: 420, radiusM: 150 });
    expect(service.startPrivateShift).toHaveBeenCalledWith(
      expect.objectContaining({ id: "d-1", privateShiftEligible: true }),
      "ps-1",
      { lat: 29.4, lng: 47.9 },
    );
  });

  test("an unknown device is a 404", async () => {
    resolveDriverFromAgentRequest.mockResolvedValue(null);
    await request(agentApp()).get("/api/agent/private-shifts").expect(404);
  });
});
