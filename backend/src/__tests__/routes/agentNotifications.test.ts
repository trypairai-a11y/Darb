// Driver notifications (client request, 2026-08-01).
//
// The feed is a per-driver boundary, and that is the whole of what is worth
// testing here. Notification is one table shared with staff notices, so the
// filter is the only thing standing between a driver and somebody else's mail:
//
//   1. Reading is scoped to the caller's own driverId. Not the tenant, which
//      would hand a driver every staff notice in the company.
//   2. Marking read carries driverId too, so guessing another driver's
//      notification id cannot mark it read on their behalf.
//   3. No device, no feed.

import express from "express";
import request from "supertest";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();

prisma.notification = prisma.notification ?? {};
for (const fn of ["findMany", "updateMany", "create"]) {
  prisma.notification[fn] = prisma.notification[fn] ?? jest.fn();
}

jest.mock("../../services/eventBus", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn(),
}));

import agentRouter from "../../routes/agent";

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

const TENANT = "t-1";
const DRIVER = {
  id: "drv-1",
  tenantId: TENANT,
  name: "Abdul Rahman",
  phone: "+96558912846",
  company: { id: "c-1", name: "Sidra Delivery Co" },
  supervisor: null,
  assignedVehicle: null,
  sims: [],
  device: null,
};
const DEVICE = { id: "dev-1", sims: [], lastSeen: new Date(), driver: DRIVER };

const ROWS = [
  {
    id: "n-1", title: "New delivery", message: "Order DRB-DWPH-000171 is yours.",
    type: "ORDER_ASSIGNED", severity: "MEDIUM", read: false,
    createdAt: new Date(), titleAr: "طلب جديد", bodyAr: "الطلب لك.",
  },
  {
    id: "n-2", title: "Cash cleared", message: "Your company settled KD 115.740.",
    type: "CASH_SETTLED", severity: "LOW", read: true,
    createdAt: new Date(), titleAr: null, bodyAr: null,
  },
];

function auth(req: request.Test): request.Test {
  return req.set("Authorization", "Bearer dev-1");
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  prisma.device.findUnique.mockResolvedValue(DEVICE);
  prisma.notification.findMany.mockResolvedValue(ROWS);
  prisma.notification.updateMany.mockResolvedValue({ count: 1 });
});

describe("GET /api/agent/notifications", () => {
  test("returns the driver's own feed, scoped to their driverId", async () => {
    const res = await auth(request(app).get("/api/agent/notifications"));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    // The unread count is what the app would badge, so it has to be the
    // driver's own unread rather than the row count.
    expect(res.body.unread).toBe(1);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, driverId: "drv-1" },
      }),
    );
  });

  test("the filter is driverId, never the tenant alone", async () => {
    await auth(request(app).get("/api/agent/notifications"));

    const where = prisma.notification.findMany.mock.calls[0][0].where;
    // A tenant-only filter would hand this driver every staff notice in the
    // company, which share this table.
    expect(where.driverId).toBe("drv-1");
    expect(where).not.toHaveProperty("userId");
  });

  test("no device, no feed", async () => {
    prisma.device.findUnique.mockResolvedValue(null);
    const res = await auth(request(app).get("/api/agent/notifications"));
    expect(res.status).toBe(404);
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/agent/notifications/read", () => {
  test("marks every unread one of the caller's own", async () => {
    const res = await auth(request(app).post("/api/agent/notifications/read").send({}));

    expect(res.status).toBe(200);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT, driverId: "drv-1", read: false }),
        data: expect.objectContaining({ read: true }),
      }),
    );
  });

  test("an id from another driver's feed cannot be marked read by guessing it", async () => {
    await auth(
      request(app).post("/api/agent/notifications/read").send({ ids: ["n-somebody-else"] }),
    );

    const where = prisma.notification.updateMany.mock.calls[0][0].where;
    // The ids narrow the update; driverId is what makes it safe. Without it,
    // any id in the table would be markable from any device.
    expect(where.driverId).toBe("drv-1");
    expect(where.id).toEqual({ in: ["n-somebody-else"] });
  });
});
