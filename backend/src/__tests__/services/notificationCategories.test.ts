import { getMockPrisma, resetAllMocks } from "../setup";
import { createSupportNotifications, createViolationNotifications, supportCategoryFor } from "../../services/notificationService";
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
// Client note of 2026-08-16: money to the accountant, operations to the
// company's own account manager, tech to the ops manager. Each test pins one
// desk so a request can never fan out to all three again.
const support = (category: string, extra: Record<string, unknown> = {}) =>
  createSupportNotifications({ tenantId: "t1", category, title: "Help", message: "Request", ...extra });
const userWhere = () => db.user.findMany.mock.calls[0][0].where;
describe("support routing by category", () => {
  beforeEach(() => {
    db.notificationRule.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([{ id: "u1" }]);
    db.accountManagerVendor.findMany.mockResolvedValue([{ userId: "amV" }]);
    db.accountManagerFleet.findMany.mockResolvedValue([{ userId: "amF" }]);
  });
  test.each([
    ["WALLET", "MONEY"], ["ORDER", "OPERATIONS"], ["TECHNICAL", "TECH"], ["OTHER", "OPERATIONS"],
    ["MONEY", "MONEY"], ["TECH", "TECH"], ["SOMETHING_NEW", "OPERATIONS"],
  ])("%s maps to %s", (input, expected) => expect(supportCategoryFor(input)).toBe(expected));
  test("money reaches the accountant only", async () => {
    await support("MONEY", { vendorId: "v1" });
    expect(userWhere().OR).toEqual([{ role: { in: ["ACCOUNTANT"] } }]);
    expect(db.accountManagerVendor.findMany).not.toHaveBeenCalled();
    expect(db.notification.createMany.mock.calls[0][0].data[0]).toMatchObject({ type: "SUPPORT_MONEY", metadata: { routedRole: "Money" } });
  });
  test("tech reaches the ops manager only", async () => {
    await support("TECHNICAL", { fleetPartnerId: "f1" });
    expect(userWhere().OR).toEqual([{ role: { in: ["OPS_MANAGER"] } }]);
    expect(db.accountManagerFleet.findMany).not.toHaveBeenCalled();
  });
  test("operations reaches only the account managers linked to that merchant", async () => {
    await support("ORDER", { vendorId: "v1" });
    expect(db.accountManagerVendor.findMany).toHaveBeenCalledWith({ where: { tenantId: "t1", vendorId: "v1" }, select: { userId: true } });
    expect(userWhere().OR).toEqual([{ role: "ACCOUNT_MANAGER", id: { in: ["amV"] } }]);
  });
  test("operations reaches only the account managers linked to that delivery company", async () => {
    await support("OPERATIONS", { fleetPartnerId: "f1" });
    expect(db.accountManagerFleet.findMany).toHaveBeenCalledWith({ where: { tenantId: "t1", fleetPartnerId: "f1" }, select: { userId: true } });
    expect(userWhere().OR).toEqual([{ role: "ACCOUNT_MANAGER", id: { in: ["amF"] } }]);
  });
  test("operations for a company nobody manages falls to the ops manager, not to nobody", async () => {
    db.accountManagerFleet.findMany.mockResolvedValue([]);
    await support("OPERATIONS", { fleetPartnerId: "f1" });
    expect(userWhere().OR).toEqual([{ role: { in: ["OPS_MANAGER"] } }]);
  });
  test("a desk switched off in Settings > Notifications is not paged", async () => {
    db.notificationRule.findMany.mockResolvedValue([{ eventType: "SUPPORT_REQUEST_SUBMITTED", role: "ACCOUNTANT", enabled: false }]);
    expect(await support("MONEY")).toEqual({ created: 0 });
    db.notificationRule.findMany.mockResolvedValue([{ eventType: "SUPPORT_REQUEST_SUBMITTED", role: "ACCOUNT_MANAGER", enabled: false }]);
    expect(await support("ORDER", { vendorId: "v1" })).toEqual({ created: 0 });
    expect(db.accountManagerVendor.findMany).not.toHaveBeenCalled();
  });
  test("an admin with the Support rule on still hears every category", async () => {
    db.notificationRule.findMany.mockResolvedValue([{ eventType: "SUPPORT_REQUEST_SUBMITTED", role: "ADMIN", enabled: true }]);
    await support("TECH");
    expect(userWhere().OR).toEqual([{ role: { in: ["ADMIN", "OPS_MANAGER"] } }]);
    db.user.findMany.mockClear();
    await support("ORDER", { vendorId: "v1" });
    expect(userWhere().OR).toEqual([{ role: { in: ["ADMIN"] } }, { role: "ACCOUNT_MANAGER", id: { in: ["amV"] } }]);
  });
});
test("turning all request roles off produces no notifications", async () => {
  db.notificationRule.findMany.mockResolvedValue(["ADMIN", "OPS_MANAGER"].map(role => ({ eventType: "FLEET_REQUEST_SUBMITTED", role, enabled: false })));
  expect(await createViolationNotifications({ tenantId: "t1", eventType: "FLEET_REQUEST_SUBMITTED", severity: "MEDIUM", title: "Request", message: "Review" })).toEqual({ created: 0 });
  expect(db.notification.createMany).not.toHaveBeenCalled();
});
