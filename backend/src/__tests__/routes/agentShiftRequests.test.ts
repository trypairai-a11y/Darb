// Booking a three-hour window (client request, 2026-08-03).
//
// The reported bug was not that the endpoint failed. It was that a driver could
// press Book, get a success back, and see nothing change: the ask travelled as
// a support ticket and left no record anything on the driver's screen could
// read. So the thing worth locking down is that the ask EXISTS afterwards and
// comes back as PENDING, plus the guards that keep one tap from becoming two
// shifts.
//
//   1. Booking writes a ShiftRequest, and GET returns it, so the driver's
//      "My shifts" list has something to draw.
//   2. The desk ticket is best-effort. Losing it must not cost the booking.
//   3. The end time is derived, never taken from the client.
//   4. A window the driver already holds answers 409 rather than opening a
//      second row for ops to arbitrate.
//   5. No device, no booking.
//
// Revision 15 (client request, 2026-08-06) moved the zone off the driver: Darb
// assigns the area and the driver only picks the hours. What that adds here:
//
//   6. The zone comes off the driver's row, and a zoneId in the body is
//      IGNORED — an older build of the app still sends one, and honouring it
//      would put a driver in an area nobody rostered them for.
//   7. A driver Darb has not assigned anywhere is refused with a code the app
//      can turn into "ask your supervisor", not a bare 400.
//   8. A window already at its cap is refused, and a window with no cap row is
//      not: an empty ShiftCapacity table is the state this shipped in.
//
// Revision 16 (client request) changed the contract these last assertions were
// written against, so several expectations below moved with it:
//
//   9. Booking CONFIRMS. There is no Darb approval step any more, so the row
//      is written APPROVED and the Shift that attendance and pay read is
//      created in the same transaction rather than by a supervisor later.
//  10. Dropping accepts APPROVED as well as PENDING. With no approval step
//      almost nothing is ever PENDING, and a guard that only took PENDING
//      would have quietly removed the driver's ability to give a shift back.
//  11. The day is cut into EIGHT windows covering the full 24 hours, not five
//      covering 10:00 to 01:00, and the cap is read per weekday.

import express from "express";
import request from "supertest";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();

prisma.shiftRequest = prisma.shiftRequest ?? {};
for (const fn of ["findMany", "findFirst", "create", "update", "updateMany", "count"]) {
  prisma.shiftRequest[fn] = prisma.shiftRequest[fn] ?? jest.fn();
}
prisma.deliveryZone = prisma.deliveryZone ?? {};
prisma.deliveryZone.findFirst = prisma.deliveryZone.findFirst ?? jest.fn();
prisma.shiftCapacity = prisma.shiftCapacity ?? {};
for (const fn of ["findFirst", "findMany"]) {
  prisma.shiftCapacity[fn] = prisma.shiftCapacity[fn] ?? jest.fn();
}
prisma.ticket = prisma.ticket ?? {};
prisma.ticket.create = prisma.ticket.create ?? jest.fn();
// Booking writes the Shift itself since revision 16 (#4).
prisma.shift = prisma.shift ?? {};
for (const fn of ["create", "updateMany"]) {
  prisma.shift[fn] = prisma.shift[fn] ?? jest.fn();
}

jest.mock("../../services/eventBus", () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn(),
}));
jest.mock("../../services/notificationService", () => ({
  createTicketSubmittedNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/ticketNumber", () => ({
  nextTicketNumber: jest.fn().mockResolvedValue("TK-0042"),
}));

import agentRouter from "../../routes/agent";

const app = express();
app.use(express.json());
app.use("/api/agent", agentRouter);

const TENANT = "t-1";
const DRIVER = {
  id: "drv-1",
  tenantId: TENANT,
  name: "Qadir Baloch",
  platform: "DARB",
  phone: "+96558912846",
  // Revision 15 — the area Darb put this driver in. Everything they can book
  // hangs off this one column.
  assignedZoneId: "z-1",
  company: { id: "c-1", name: "Sidra Delivery Co" },
  supervisor: null,
  assignedVehicle: null,
  sims: [],
  device: null,
};
const DEVICE = { id: "dev-1", sims: [], lastSeen: new Date(), driver: DRIVER };
const ZONE = { id: "z-1", name: "Salmiya" };

/** A day far enough ahead to sit inside the one-week horizon whenever this runs. */
function soon(): string {
  const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function auth(req: request.Test): request.Test {
  return req.set("Authorization", "Bearer dev-1");
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  prisma.device.findUnique.mockResolvedValue(DEVICE);
  prisma.deliveryZone.findFirst.mockResolvedValue(ZONE);
  prisma.shiftRequest.findFirst.mockResolvedValue(null);
  prisma.shiftRequest.findMany.mockResolvedValue([]);
  prisma.shiftRequest.count.mockResolvedValue(0);
  // No capacity row is the default state: the table ships empty and an empty
  // table must not read as "every window closed".
  prisma.shiftCapacity.findFirst.mockResolvedValue(null);
  prisma.shiftCapacity.findMany.mockResolvedValue([]);
  prisma.shiftRequest.update.mockImplementation(async ({ data }: any) => ({
    id: "sr-1",
    date: new Date(),
    startTime: "16:00",
    endTime: "19:00",
    zoneName: "Salmiya",
    status: "APPROVED",
    declineReason: null,
    createdAt: new Date(),
    ...data,
  }));
  prisma.shiftRequest.create.mockImplementation(async ({ data }: any) => ({
    id: "sr-1",
    declineReason: null,
    createdAt: new Date(),
    ...data,
  }));
  prisma.shift.create.mockResolvedValue({ id: "sh-1" });
  prisma.shift.updateMany.mockResolvedValue({ count: 1 });
  prisma.ticket.create.mockResolvedValue({
    id: "tk-1",
    ticketNumber: "TK-0042",
    title: "Shift request",
    category: "SHIFT_REQUEST",
  });
});

describe("POST /api/agent/shift-requests", () => {
  test("booking confirms the shift outright, with no Darb approval left to wait on", async () => {
    const day = soon();
    const res = await auth(
      request(app).post("/api/agent/shift-requests").send({ date: day, startTime: "16:00" }),
    );

    expect(res.status).toBe(201);
    expect(prisma.shiftRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          driverId: "drv-1",
          tenantId: TENANT,
          startTime: "16:00",
          status: "APPROVED",
          zoneName: "Salmiya",
        }),
      }),
    );
    // The Shift is the row attendance and pay are computed from. Writing the
    // request without it would leave the driver reading Confirmed against
    // nothing, which is the state the old approve step existed to avoid.
    expect(prisma.shift.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          driverId: "drv-1",
          tenantId: TENANT,
          status: "BOOKED",
          zone: "Salmiya",
        }),
      }),
    );
  });

  test("the end time is derived, not taken from the client", async () => {
    const day = soon();
    // A client sending its own four-hour window must not get one.
    const res = await auth(
      request(app)
        .post("/api/agent/shift-requests")
        .send({ date: day, startTime: "22:00", endTime: "04:00" }),
    );

    expect(res.status).toBe(201);
    // 22:00 plus three hours wraps to 01:00, and stays three hours.
    expect(prisma.shiftRequest.create.mock.calls[0][0].data.endTime).toBe("01:00");
  });

  test("losing the desk ticket does not cost the driver their booking", async () => {
    prisma.ticket.create.mockRejectedValue(new Error("ticket sequence wedged"));
    const res = await auth(
      request(app).post("/api/agent/shift-requests").send({ date: soon(), startTime: "16:00" }),
    );

    expect(res.status).toBe(201);
    expect(prisma.shift.create).toHaveBeenCalled();
  });

  test("a window the driver already holds answers 409, not a second row", async () => {
    prisma.shiftRequest.findFirst.mockResolvedValue({ id: "sr-0", status: "PENDING" });
    const res = await auth(
      request(app).post("/api/agent/shift-requests").send({ date: soon(), startTime: "16:00" }),
    );

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_REQUESTED");
    expect(prisma.shiftRequest.create).not.toHaveBeenCalled();
  });

  test("a zoneId in the body is ignored, the driver's own area is used", async () => {
    // An older build of the app still sends the zone it drew chips for. If it
    // were honoured, a driver could book an area nobody rostered them into,
    // which is the whole thing revision 15 took away.
    const res = await auth(
      request(app)
        .post("/api/agent/shift-requests")
        .send({ date: soon(), startTime: "16:00", zoneId: "z-9-somewhere-else" }),
    );

    expect(res.status).toBe(201);
    expect(prisma.deliveryZone.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "z-1" }) }),
    );
    expect(prisma.shiftRequest.create.mock.calls[0][0].data.zoneId).toBe("z-1");
  });

  test("a driver Darb has not assigned an area cannot book", async () => {
    prisma.device.findUnique.mockResolvedValue({
      ...DEVICE,
      driver: { ...DRIVER, assignedZoneId: null },
    });
    const res = await auth(
      request(app).post("/api/agent/shift-requests").send({ date: soon(), startTime: "16:00" }),
    );

    expect(res.status).toBe(409);
    // The code is what the app turns into "ask your supervisor". A bare 400
    // would read to the driver as a broken button.
    expect(res.body.code).toBe("NO_ZONE_ASSIGNED");
    expect(prisma.shiftRequest.create).not.toHaveBeenCalled();
  });

  test("a window already at its cap is refused", async () => {
    prisma.shiftCapacity.findFirst.mockResolvedValue({ maxDrivers: 2 });
    prisma.shiftRequest.count.mockResolvedValue(2);

    const res = await auth(
      request(app).post("/api/agent/shift-requests").send({ date: soon(), startTime: "16:00" }),
    );

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("WINDOW_FULL");
    expect(prisma.shiftRequest.create).not.toHaveBeenCalled();
  });

  test("a window with no capacity row is not capped", async () => {
    // The table ships empty. If a missing row read as zero, this change would
    // have closed every window in every zone the moment it deployed.
    prisma.shiftCapacity.findFirst.mockResolvedValue(null);
    prisma.shiftRequest.count.mockResolvedValue(99);

    const res = await auth(
      request(app).post("/api/agent/shift-requests").send({ date: soon(), startTime: "16:00" }),
    );

    expect(res.status).toBe(201);
  });

  test("a day that has already passed is refused", async () => {
    const res = await auth(
      request(app).post("/api/agent/shift-requests").send({ date: "2020-01-01", startTime: "16:00" }),
    );

    expect(res.status).toBe(400);
    expect(prisma.shiftRequest.create).not.toHaveBeenCalled();
  });

  test("no device, no booking", async () => {
    prisma.device.findUnique.mockResolvedValue(null);
    const res = await auth(
      request(app).post("/api/agent/shift-requests").send({ date: soon(), startTime: "16:00" }),
    );

    expect(res.status).toBe(404);
    expect(prisma.shiftRequest.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/agent/shift-slots", () => {
  test("a driver with no area gets no windows, and the reason is legible", async () => {
    prisma.device.findUnique.mockResolvedValue({
      ...DEVICE,
      driver: { ...DRIVER, assignedZoneId: null },
    });

    const res = await auth(request(app).get(`/api/agent/shift-slots?date=${soon()}`));

    expect(res.status).toBe(200);
    // Not an error: the app draws "Darb has not set your area yet" off this,
    // which beats five buttons that would each answer 409 on the tap.
    expect(res.body.zone).toBeNull();
    expect(res.body.windows).toEqual([]);
  });

  test("the driver's own area comes back with every window", async () => {
    prisma.deliveryZone.findFirst.mockResolvedValue({ id: "z-1", name: "Salmiya", nameAr: "السالمية" });

    const res = await auth(request(app).get(`/api/agent/shift-slots?date=${soon()}`));

    expect(res.status).toBe(200);
    expect(res.body.zone.name).toBe("Salmiya");
    // Eight three-hour windows, because revision 16 (#2) closed the 01:00 to
    // 10:00 hole. That gap was not a closed period, it was an absence: no row
    // could be written against a window that did not exist, so no zone could
    // be staffed overnight however much Darb wanted it to be.
    expect(res.body.windows).toHaveLength(8);
    expect(res.body.windows.map((w: any) => w.start)).toEqual([
      "01:00", "04:00", "07:00", "10:00", "13:00", "16:00", "19:00", "22:00",
    ]);
    // No capacity row anywhere means no cap anywhere.
    expect(res.body.windows.every((w: any) => w.capacity === null && w.full === false)).toBe(true);
  });

  test("the cap is read for the weekday being asked about, not the whole zone", async () => {
    await auth(request(app).get(`/api/agent/shift-slots?date=${soon()}`));

    // One shared grid could only ever say the same number for a Friday and a
    // Tuesday. Reading without the day back would pick up six other days' rows.
    const where = prisma.shiftCapacity.findMany.mock.calls[0][0].where;
    expect(typeof where.dayOfWeek).toBe("number");
    expect(where.dayOfWeek).toBeGreaterThanOrEqual(0);
    expect(where.dayOfWeek).toBeLessThanOrEqual(6);
  });

  test("a capped window reports what is left, and a full one says so", async () => {
    prisma.shiftCapacity.findMany.mockResolvedValue([
      { startTime: "16:00", maxDrivers: 3 },
      { startTime: "19:00", maxDrivers: 1 },
    ]);
    prisma.shiftRequest.findMany.mockResolvedValue([
      { startTime: "16:00", driverId: "drv-2" },
      { startTime: "19:00", driverId: "drv-2" },
    ]);

    const res = await auth(request(app).get(`/api/agent/shift-slots?date=${soon()}`));

    const at16 = res.body.windows.find((w: any) => w.start === "16:00");
    const at19 = res.body.windows.find((w: any) => w.start === "19:00");
    expect(at16.remaining).toBe(2);
    expect(at16.full).toBe(false);
    expect(at19.remaining).toBe(0);
    expect(at19.full).toBe(true);
  });

  test("a window this driver already holds is marked as theirs", async () => {
    prisma.shiftRequest.findMany.mockResolvedValue([{ startTime: "13:00", driverId: "drv-1" }]);

    const res = await auth(request(app).get(`/api/agent/shift-slots?date=${soon()}`));

    const at13 = res.body.windows.find((w: any) => w.start === "13:00");
    // Offering Book on something already booked is how a driver ends up with
    // two rows for one afternoon and a 409 they cannot act on.
    expect(at13.mine).toBe(true);
  });
});

describe("GET /api/agent/shift-requests", () => {
  test("returns the caller's own asks, scoped to their driverId", async () => {
    prisma.shiftRequest.findMany.mockResolvedValue([
      {
        id: "sr-1",
        date: new Date(),
        startTime: "16:00",
        endTime: "19:00",
        zoneName: "Salmiya",
        status: "PENDING",
        declineReason: null,
        createdAt: new Date(),
      },
    ]);

    const res = await auth(request(app).get("/api/agent/shift-requests"));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe("PENDING");
    expect(prisma.shiftRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ driverId: "drv-1" }) }),
    );
  });
});

describe("POST /api/agent/shift-requests/:id/cancel", () => {
  test("dropping is guarded on the driver, and takes a confirmed booking too", async () => {
    prisma.shiftRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.shiftRequest.findFirst.mockResolvedValue({ shiftId: "sh-1" });
    const res = await auth(request(app).post("/api/agent/shift-requests/sr-1/cancel").send({}));

    expect(res.status).toBe(200);
    // APPROVED has to be claimable: booking confirms on the tap now, so a
    // guard that only took PENDING would leave a driver with no way to give a
    // shift back.
    expect(prisma.shiftRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sr-1", driverId: "drv-1", status: { in: ["PENDING", "APPROVED"] } },
      }),
    );
    // The Shift goes with it, or attendance still expects the driver.
    expect(prisma.shift.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "sh-1", status: "BOOKED" }),
        data: { status: "CANCELLED" },
      }),
    );
  });

  test("one Darb has already decided answers 409", async () => {
    prisma.shiftRequest.updateMany.mockResolvedValue({ count: 0 });
    const res = await auth(request(app).post("/api/agent/shift-requests/sr-1/cancel").send({}));

    expect(res.status).toBe(409);
  });
});
