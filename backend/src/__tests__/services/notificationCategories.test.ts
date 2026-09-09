import { getMockPrisma, resetAllMocks } from "../setup";
import { createSupportNotifications, createViolationNotifications } from "../../services/notificationService";
import { withCategoryDefaults } from "../../services/notificationRuleDefaults";
const db = getMockPrisma();
for (const model of ["user", "notificationRule", "notification", "accountManagerFleet", "accountManagerVendor"]) {
  db[model] ??= {};
  for (const method of ["findMany", "createMany"]) db[model][method] ??= jest.fn();
}
beforeEach(() => { resetAllMocks(); db.notification.createMany.mockResolvedValue({ count: 1 }); });
test("a saved false wins over notification defaults", () => {
  const rules = withCategoryDefaults([{ eventType: "FLEET_REQUEST_SUBMITTED", role: "ADMIN", enabled: false }]);
  expect(rules.filter(r => r.eventType === "FLEET_REQUEST_SUBMITTED" && r.role === "ADMIN")).toEqual([{ eventType: "FLEET_REQUEST_SUBMITTED", role: "ADMIN", enabled: false }]);
});
test("support honors disabled roles and scopes account managers to their company", async () => {
  db.notificationRule.findMany.mockResolvedValue([{ eventType: "SUPPORT_REQUEST_SUBMITTED", role: "ACCOUNTANT", enabled: false }]);
  db.accountManagerFleet.findMany.mockResolvedValue([{ userId: "am1" }]);
  db.user.findMany.mockResolvedValue([{ id: "am1" }]);
  await createSupportNotifications({ tenantId: "t1", category: "MONEY", title: "Help", message: "Request", fleetPartnerId: "f1" });
  expect(db.user.findMany).toHaveBeenCalledWith({ where: { tenantId: "t1", isActive: true, OR: [{ role: { in: ["OPS_MANAGER"] } }, { role: "ACCOUNT_MANAGER", id: { in: ["am1"] } }] }, select: { id: true } });
  expect(db.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ userId: "am1", type: "SUPPORT_MONEY" })] }));
});
test("turning all request roles off produces no notifications", async () => {
  db.notificationRule.findMany.mockResolvedValue(["ADMIN", "OPS_MANAGER"].map(role => ({ eventType: "FLEET_REQUEST_SUBMITTED", role, enabled: false })));
  expect(await createViolationNotifications({ tenantId: "t1", eventType: "FLEET_REQUEST_SUBMITTED", severity: "MEDIUM", title: "Request", message: "Review" })).toEqual({ created: 0 });
  expect(db.notification.createMany).not.toHaveBeenCalled();
});
