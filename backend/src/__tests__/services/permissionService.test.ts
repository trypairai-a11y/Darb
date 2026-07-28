/**
 * Per-user surface permissions — revision 4 (#12).
 *
 * The property that makes this safe to ship is inheritance: a user with no
 * override rows must behave exactly as their role always did. Everything else
 * here is the override laid on top.
 */
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();

prisma.userSurfacePermission = prisma.userSurfacePermission ?? {};
prisma.userSurfacePermission.findMany = prisma.userSurfacePermission.findMany ?? jest.fn();
prisma.accountManagerVendor = prisma.accountManagerVendor ?? {};
prisma.accountManagerVendor.findMany = prisma.accountManagerVendor.findMany ?? jest.fn();
prisma.user = prisma.user ?? {};
prisma.user.findFirst = prisma.user.findFirst ?? jest.fn();

const {
  can,
  defaultsForRole,
  managedVendorIds,
  resolvePermissions,
  roleDefault,
} = require("../../services/permissionService");

const TENANT = "t-1";
const USER = "u-1";

function primeUser(role: string, overrides: Array<{ surface: string; level: string }> = []) {
  prisma.user.findFirst.mockResolvedValue({ role });
  prisma.userSurfacePermission.findMany.mockResolvedValue(overrides);
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.userSurfacePermission.findMany.mockResolvedValue([]);
  prisma.accountManagerVendor.findMany.mockResolvedValue([]);
});

describe("role defaults", () => {
  test("ADMIN reaches everything", () => {
    const map = defaultsForRole("ADMIN");
    expect(Object.values(map).every((l) => l === "EDIT")).toBe(true);
  });

  test("CASH_COLLECTOR reaches the cash desk and nothing else", () => {
    const map = defaultsForRole("CASH_COLLECTOR");
    expect(map.CASH_DESK).toBe("EDIT");
    expect(map.MONEY).toBe("NONE");
    expect(map.ORDERS).toBe("NONE");
    expect(map.SETUP).toBe("NONE");
  });

  test("an unknown role reaches nothing rather than everything", () => {
    expect(roleDefault("SOMETHING_NEW", "MONEY")).toBe("NONE");
    expect(Object.values(defaultsForRole("SOMETHING_NEW")).every((l) => l === "NONE")).toBe(true);
  });
});

describe("resolvePermissions", () => {
  test("no override rows means the role default, unchanged", async () => {
    primeUser("ACCOUNTANT");

    const map = await resolvePermissions(TENANT, USER);

    expect(map).toEqual(defaultsForRole("ACCOUNTANT"));
  });

  test("an override wins over the role default", async () => {
    primeUser("ACCOUNTANT", [{ surface: "MONEY", level: "VIEW" }]);

    const map = await resolvePermissions(TENANT, USER);

    expect(map.MONEY).toBe("VIEW"); // role default is EDIT
    expect(map.CASH_DESK).toBe("EDIT"); // untouched surfaces still inherit
  });

  test("an override can grant a surface the role does not have", async () => {
    primeUser("VIEWER", [{ surface: "SETUP", level: "EDIT" }]);

    const map = await resolvePermissions(TENANT, USER);

    expect(map.SETUP).toBe("EDIT");
  });

  test("a user who does not exist reaches nothing", async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    const map = await resolvePermissions(TENANT, "ghost");

    expect(Object.values(map).every((l) => l === "NONE")).toBe(true);
  });
});

describe("can", () => {
  test("EDIT satisfies a VIEW requirement, VIEW does not satisfy EDIT", async () => {
    primeUser("SUPERVISOR"); // ORDERS: EDIT

    await expect(can(TENANT, USER, "ORDERS", "VIEW")).resolves.toBe(true);
    await expect(can(TENANT, USER, "ORDERS", "EDIT")).resolves.toBe(true);

    primeUser("VIEWER"); // ORDERS: VIEW
    await expect(can(TENANT, USER, "ORDERS", "VIEW")).resolves.toBe(true);
    await expect(can(TENANT, USER, "ORDERS", "EDIT")).resolves.toBe(false);
  });

  test("NONE fails even a VIEW requirement", async () => {
    primeUser("CASH_COLLECTOR");

    await expect(can(TENANT, USER, "MONEY", "VIEW")).resolves.toBe(false);
  });

  test("an override that revokes is enforced, not just hidden in the rail", async () => {
    primeUser("ADMIN", [{ surface: "MONEY", level: "NONE" }]);

    await expect(can(TENANT, USER, "MONEY", "VIEW")).resolves.toBe(false);
  });
});

describe("managedVendorIds", () => {
  test("returns the merchants an account manager owns", async () => {
    prisma.accountManagerVendor.findMany.mockResolvedValue([
      { vendorId: "v-1" },
      { vendorId: "v-2" },
    ]);

    await expect(managedVendorIds(TENANT, USER)).resolves.toEqual(["v-1", "v-2"]);
  });

  test("is empty for anyone who manages nothing", async () => {
    await expect(managedVendorIds(TENANT, USER)).resolves.toEqual([]);
  });
});
