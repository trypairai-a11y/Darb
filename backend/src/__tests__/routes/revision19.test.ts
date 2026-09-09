import request from "supertest";
import express from "express";
import { getMockPrisma, resetAllMocks } from "../setup";
import { transitionOrder } from "../../services/orderStateMachine";
import { forceDriverOffline } from "../../services/dispatch/driverPresence";
import { effectiveFleetTabs } from "../../services/fleet/fleetTabService";

jest.mock("../../services/eventBus", () => ({ publishEvent: jest.fn().mockResolvedValue(undefined) }));
import fleetsRouter from "../../routes/fleets";
import agentRouter, { resolveDriverFromAgentRequest } from "../../routes/agent";

const db = getMockPrisma();
for (const model of ["auditLog", "locationLog", "fleetPartner", "dispatchOffer"]) {
  db[model] ??= {};
  for (const method of ["findFirst", "create", "createMany", "updateMany"]) db[model][method] ??= jest.fn();
}
function staffApp(role = "OPS_MANAGER") {
  const app = express(); app.use(express.json());
  app.use((req: any, _res, next) => { req.user = { tenantId: "t1", userId: "u1", role, email: "ops@example.test" }; next(); });
  app.use("/api/fleets", fleetsRouter); return app;
}
const agentApp = express(); agentApp.use(express.json()); agentApp.use("/api/agent", agentRouter);

beforeEach(() => {
  resetAllMocks();
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.driver.findFirst.mockResolvedValue({ id: "d1" });
  db.driver.updateMany.mockResolvedValue({ count: 1 });
  db.courierOnlineSession.updateMany.mockResolvedValue({ count: 2 });
});

test("freezing preserves activation and closes every session in the same transaction", async () => {
  const res = await request(staffApp()).patch("/api/fleets/f1/drivers/d1/account").send({ isFrozen: true });
  expect(res.status).toBe(200);
  expect(db.driver.updateMany).toHaveBeenCalledWith({ where: { id: "d1", tenantId: "t1", fleetPartnerId: "f1" }, data: { isFrozen: true } });
  expect(db.courierOnlineSession.updateMany).toHaveBeenCalledWith({ where: { tenantId: "t1", driverId: "d1", isOnline: true }, data: { availability: "OFFLINE", isOnline: false, endTime: expect.any(Date) } });
  expect(db.dispatchOffer.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "t1", driverId: "d1", status: "OFFERED" }, data: expect.objectContaining({ status: "EXPIRED" }) }));
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "DRIVER_ACCOUNT_UPDATED", changes: { isFrozen: true } }) }));
});
test("unfreezing does not activate a driver or open a session", async () => {
  const res = await request(staffApp()).patch("/api/fleets/f1/drivers/d1/account").send({ isFrozen: false });
  expect(res.status).toBe(200);
  expect(db.driver.updateMany.mock.calls[0][0].data).toEqual({ isFrozen: false });
  expect(db.courierOnlineSession.updateMany).not.toHaveBeenCalled();
});
test("account actions cannot target a driver in another company", async () => {
  db.driver.findFirst.mockResolvedValue(null);
  const res = await request(staffApp()).patch("/api/fleets/f1/drivers/d2/account").send({ status: "INACTIVE" });
  expect(res.status).toBe(404);
  expect(db.driver.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "d2", tenantId: "t1", fleetPartnerId: "f1" } }));
  expect(db.driver.updateMany).not.toHaveBeenCalled();
});
test("a supervisor cannot change driver account access", async () => {
  const res = await request(staffApp("SUPERVISOR")).patch("/api/fleets/f1/drivers/d1/account").send({ isFrozen: true });
  expect(res.status).toBe(403);
  expect(db.driver.updateMany).not.toHaveBeenCalled();
});
test("frozen account rejects an already issued device token", async () => {
  db.device.findUnique.mockResolvedValue({ driver: { id: "d1", isFrozen: true } });
  expect(await resolveDriverFromAgentRequest({ headers: { authorization: "Bearer device1" }, query: {}, body: {} } as any)).toBeNull();
});
test("GPS arriving after Put offline cannot recreate an online session", async () => {
  db.device.findUnique.mockResolvedValue({ id: "device1", driver: { id: "d1", tenantId: "t1" } });
  db.courierOnlineSession.findFirst.mockResolvedValue(null);
  db.locationLog.createMany.mockResolvedValue({ count: 1 });
  const res = await request(agentApp).post("/api/agent/location").send({ deviceId: "device1", driverId: "d1", locations: [{ latitude: 29.3, longitude: 48, accuracy: 5, capturedAt: new Date().toISOString() }] });
  expect(res.status).toBe(200);
  expect(db.locationLog.createMany).toHaveBeenCalled();
  expect(db.courierOnlineSession.create).not.toHaveBeenCalled();
});
test("offline action is idempotent when no sessions remain", async () => {
  db.courierOnlineSession.updateMany.mockResolvedValue({ count: 0 });
  expect(await forceDriverOffline(db as any, "t1", "d1")).toBe(false);
});
test("confirmed return writes the final vendor handback event", async () => {
  const tx = { deliveryOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, orderEvent: { create: jest.fn().mockResolvedValue({ id: "ev1" }) } };
  await transitionOrder(tx as any, { tenantId: "t1", orderId: "o1", from: "FAILED", to: "RETURNED", actor: { type: "USER", id: "u1" } });
  expect(tx.orderEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ description: "Order returned to vendor" }) }));
});
test("the retired scorecard disappears from stored overrides and default roles", () => {
  expect(effectiveFleetTabs("ADMIN", null)).not.toContain("SCORECARD");
  expect(effectiveFleetTabs("ACCOUNTANT", ["SCORECARD", "PAYOUTS"])).toEqual(["PAYOUTS"]);
});
