// Revision 24 (#3): a 12-hour duty is several 2, 3 or 4-hour slots stacked
// into one day, and attendance, staff scheduling and the ops view had to read
// several Shift rows a day instead of one. What is locked down here:
//
//   1. Clock-in picks the slot running now, else the next one to start, never
//      simply the day's first: lateness is measured from the right slot. The
//      day is read on the Kuwait calendar, because a booked Shift's `date` is
//      Kuwait midnight (on a UTC host the server's own midnight missed every
//      booked shift and each clock-in opened an ad-hoc 8-hour one).
//   2. A repeated clock-in on a slot already under way is the same clock-in:
//      actualStart does not move and late minutes are not added twice.
//   3. The day's attendance row keeps LATE once set, and late minutes add up
//      across the slots of the day.
//   4. One clock-out completes the back-to-back slots that followed the one
//      clocked into, each with its own share of the time; a slot after a gap
//      is left alone.
//   5. Staff shift creation checks overlap against EVERY shift that day, not
//      just the first one found.
//   6. GET /api/shift-planning/bookings groups a Kuwait day's bookings per
//      driver against the 12-hour duty, short days first.

import express from "express";
import request from "supertest";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();

prisma.shift = prisma.shift ?? {};
for (const fn of ["findMany", "findFirst", "create", "update", "updateMany"]) {
  prisma.shift[fn] = prisma.shift[fn] ?? jest.fn();
}
prisma.attendanceRecord = prisma.attendanceRecord ?? {};
for (const fn of ["findUnique", "upsert", "updateMany"]) {
  prisma.attendanceRecord[fn] = prisma.attendanceRecord[fn] ?? jest.fn();
}
prisma.device = prisma.device ?? {};
prisma.device.findUnique = prisma.device.findUnique ?? jest.fn();
prisma.driver = prisma.driver ?? {};
prisma.driver.findFirst = prisma.driver.findFirst ?? jest.fn();
prisma.shiftRequest = prisma.shiftRequest ?? {};
prisma.shiftRequest.findMany = prisma.shiftRequest.findMany ?? jest.fn();

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
// The selfie is a multipart upload; the route only reads its filename, so
// the disk writer is swapped for one that hands a file over and writes nothing.
jest.mock("../../utils/upload", () => {
  const pass = () => (req: any, _res: any, next: any) => {
    req.file = { filename: "selfie.jpg" };
    next();
  };
  return { upload: { single: pass, array: () => (_req: any, _res: any, next: any) => next(), fields: pass } };
});

import agentRouter from "../../routes/agent";
import shiftsRouter from "../../routes/shifts";
import shiftPlanningRouter from "../../routes/shiftPlanning";

const agentApp = express();
agentApp.use(express.json());
agentApp.use("/api/agent", agentRouter);

function staffApp(role = "OPS_MANAGER") {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: "u-1", tenantId: TENANT, role, email: "ops@darb.kw" };
    next();
  });
  app.use("/api/shifts", shiftsRouter);
  app.use("/api/shift-planning", shiftPlanningRouter);
  return app;
}

const TENANT = "t-1";
const DRIVER = { id: "drv-1", tenantId: TENANT, platform: "TALABAT", zone: "Salmiya" };

// 15 October 2026 on the Kuwait calendar (UTC+3, no daylight saving).
const KUWAIT_DAY = new Date("2026-10-14T21:00:00.000Z");
/** The instant of "HH:MM" Kuwait time on 15 October. */
function k(hhmm: string, dayOffset = 0): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(KUWAIT_DAY.getTime() + dayOffset * 86_400_000 + (h! * 60 + m!) * 60_000);
}

function slot(id: string, start: string, end: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    tenantId: TENANT,
    driverId: DRIVER.id,
    date: KUWAIT_DAY,
    scheduledStart: k(start),
    scheduledEnd: k(end),
    status: "BOOKED",
    actualStart: null,
    ...extra,
  };
}

function at(instant: Date) {
  jest.useFakeTimers({
    now: instant.getTime(),
    doNotFake: [
      "nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout",
      "setInterval", "clearInterval", "queueMicrotask", "hrtime", "performance",
    ],
  });
}

function localMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function clockIn() {
  return request(agentApp).post("/api/agent/selfie").send({ deviceId: "dev-1", action: "ACTION_CLOCK_IN" });
}
function clockOut() {
  return request(agentApp).post("/api/agent/selfie").send({ deviceId: "dev-1", action: "ACTION_CLOCK_OUT" });
}

beforeEach(() => {
  resetAllMocks();
  prisma.device.findUnique.mockResolvedValue({ id: "dev-1", driver: DRIVER });
  prisma.shift.update.mockResolvedValue({});
  prisma.shift.updateMany.mockResolvedValue({ count: 1 });
  prisma.attendanceRecord.findUnique.mockResolvedValue(null);
  prisma.attendanceRecord.upsert.mockResolvedValue({});
  prisma.attendanceRecord.updateMany.mockResolvedValue({ count: 1 });
  prisma.driver.findFirst.mockResolvedValue(null);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("clock-in picks the slot", () => {
  const day = [
    slot("s-morning", "07:00", "11:00"),
    slot("s-midday", "11:00", "14:00"),
    slot("s-afternoon", "14:00", "18:00"),
    slot("s-evening", "18:00", "22:00"),
  ];

  test("the slot running now, and lateness is measured from its start", async () => {
    at(k("14:30"));
    prisma.shift.findMany.mockResolvedValue(day);

    const res = await clockIn().expect(200);

    expect(res.body).toMatchObject({ shiftId: "s-afternoon", isLate: true, lateMinutes: 30 });
    expect(prisma.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s-afternoon" },
        data: expect.objectContaining({ status: "IN_PROGRESS", actualStart: k("14:30") }),
      }),
    );
    expect(prisma.shift.create).not.toHaveBeenCalled();
  });

  test("the day is read on the Kuwait calendar, where booked shifts are dated", async () => {
    at(k("14:30"));
    prisma.shift.findMany.mockResolvedValue(day);

    await clockIn().expect(200);

    const where = prisma.shift.findMany.mock.calls[0][0].where;
    expect(where.date.gte.getTime()).toBeLessThanOrEqual(KUWAIT_DAY.getTime());
    expect(where.date.lt.getTime()).toBeGreaterThan(KUWAIT_DAY.getTime());
    expect(where.date.lt.getTime()).toBe(KUWAIT_DAY.getTime() + 86_400_000);
  });

  test("between slots, the next one to start, and arriving early is not late", async () => {
    at(k("13:50"));
    prisma.shift.findMany.mockResolvedValue([slot("s-morning", "07:00", "11:00"), slot("s-afternoon", "14:00", "18:00")]);

    const res = await clockIn().expect(200);

    expect(res.body).toMatchObject({ shiftId: "s-afternoon", isLate: false, lateMinutes: 0 });
  });

  test("yesterday's slot that runs past midnight is still the one to clock into", async () => {
    at(k("00:30"));
    const lateNight = {
      ...slot("s-late", "22:00", "02:00"),
      date: new Date(KUWAIT_DAY.getTime() - 86_400_000),
      scheduledStart: k("22:00", -1),
      scheduledEnd: k("02:00"),
    };
    const finished = {
      ...slot("s-yesterday", "10:00", "14:00"),
      date: new Date(KUWAIT_DAY.getTime() - 86_400_000),
      scheduledStart: k("10:00", -1),
      scheduledEnd: k("14:00", -1),
    };
    prisma.shift.findMany.mockResolvedValue([finished, lateNight, slot("s-morning", "07:00", "11:00")]);

    const res = await clockIn().expect(200);

    expect(res.body.shiftId).toBe("s-late");
    expect(res.body.lateMinutes).toBe(150);
  });

  test("no booked slot at all opens an ad-hoc shift dated on the Kuwait day", async () => {
    at(k("09:00"));
    prisma.shift.findMany.mockResolvedValue([]);
    prisma.shift.create.mockResolvedValue({ id: "s-adhoc", scheduledStart: k("09:00"), status: "BOOKED" });

    const res = await clockIn().expect(200);

    expect(res.body.shiftId).toBe("s-adhoc");
    expect(prisma.shift.create.mock.calls[0][0].data.date).toEqual(KUWAIT_DAY);
  });
});

describe("the day's attendance row", () => {
  test("a later slot on time keeps a morning's LATE and its minutes", async () => {
    at(k("13:58"));
    prisma.shift.findMany.mockResolvedValue([slot("s-afternoon", "14:00", "18:00")]);
    prisma.attendanceRecord.findUnique.mockResolvedValue({
      shiftId: "s-morning",
      darbClockIn: k("07:20"),
      platformClockIn: null,
      status: "LATE",
      lateMinutes: 20,
    });

    await clockIn().expect(200);

    const { update } = prisma.attendanceRecord.upsert.mock.calls[0][0];
    expect(update).toMatchObject({ status: "LATE", lateMinutes: 20, shiftId: "s-morning", darbClockIn: k("07:20") });
  });

  test("late minutes add up across the day's slots", async () => {
    at(k("14:30"));
    prisma.shift.findMany.mockResolvedValue([slot("s-afternoon", "14:00", "18:00")]);
    prisma.attendanceRecord.findUnique.mockResolvedValue({
      shiftId: "s-morning",
      darbClockIn: k("07:20"),
      platformClockIn: null,
      status: "LATE",
      lateMinutes: 20,
    });

    await clockIn().expect(200);

    expect(prisma.attendanceRecord.upsert.mock.calls[0][0].update).toMatchObject({ status: "LATE", lateMinutes: 50 });
  });

  test("an on-time first slot is PRESENT and a late second one turns the day LATE", async () => {
    at(k("14:10"));
    prisma.shift.findMany.mockResolvedValue([slot("s-afternoon", "14:00", "18:00")]);
    prisma.attendanceRecord.findUnique.mockResolvedValue({
      shiftId: "s-morning",
      darbClockIn: k("06:58"),
      platformClockIn: null,
      status: "PRESENT",
      lateMinutes: 0,
    });

    await clockIn().expect(200);

    expect(prisma.attendanceRecord.upsert.mock.calls[0][0].update).toMatchObject({ status: "LATE", lateMinutes: 10 });
  });

  test("a repeated clock-in on a slot under way neither moves the start nor counts the lateness twice", async () => {
    at(k("14:45"));
    prisma.shift.findMany.mockResolvedValue([
      slot("s-afternoon", "14:00", "18:00", { status: "IN_PROGRESS", actualStart: k("14:30") }),
    ]);
    prisma.attendanceRecord.findUnique.mockResolvedValue({
      shiftId: "s-afternoon",
      darbClockIn: k("14:30"),
      platformClockIn: null,
      status: "LATE",
      lateMinutes: 30,
    });

    const res = await clockIn().expect(200);

    expect(res.body).toMatchObject({ shiftId: "s-afternoon", lateMinutes: 30 });
    expect(prisma.shift.update.mock.calls[0][0].data).not.toHaveProperty("actualStart");
    expect(prisma.attendanceRecord.upsert.mock.calls[0][0].update).toMatchObject({ status: "LATE", lateMinutes: 30 });
  });
});

describe("one clock-out completes the back-to-back slots", () => {
  test("4 + 3 + 4 worked straight through: each slot gets its own share", async () => {
    at(k("18:10"));
    prisma.shift.findFirst.mockResolvedValue(
      slot("s-morning", "07:00", "11:00", { status: "IN_PROGRESS", actualStart: k("07:05") }),
    );
    prisma.shift.findMany.mockResolvedValue([
      slot("s-midday", "11:00", "14:00"),
      slot("s-afternoon", "14:00", "18:00"),
    ]);

    const res = await clockOut().expect(200);

    expect(res.body).toMatchObject({ shiftId: "s-morning", actualMinutes: 235 });
    expect(prisma.shift.update).toHaveBeenCalledWith({
      where: { id: "s-morning" },
      data: expect.objectContaining({ status: "COMPLETED", actualEnd: k("11:00"), actualHoursMinutes: 235 }),
    });
    const followers = prisma.shift.updateMany.mock.calls.map((c: any[]) => c[0]);
    expect(followers).toHaveLength(2);
    expect(followers[0]).toMatchObject({
      where: { id: "s-midday", tenantId: TENANT, status: "BOOKED" },
      data: { status: "COMPLETED", actualStart: k("11:00"), actualEnd: k("14:00"), actualHoursMinutes: 180, clockInMethod: "continued" },
    });
    expect(followers[1]).toMatchObject({
      where: { id: "s-afternoon" },
      data: { status: "COMPLETED", actualStart: k("14:00"), actualEnd: k("18:10"), actualHoursMinutes: 250 },
    });
    // Only slots that had already started are read as followers.
    const where = prisma.shift.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: "BOOKED", scheduledStart: { lt: k("18:10") } });
  });

  test("a slot after a gap is not completed on the driver's behalf", async () => {
    at(k("14:30"));
    prisma.shift.findFirst.mockResolvedValue(
      slot("s-morning", "07:00", "11:00", { status: "IN_PROGRESS", actualStart: k("07:00") }),
    );
    prisma.shift.findMany.mockResolvedValue([slot("s-noon", "12:00", "14:00")]);

    const res = await clockOut().expect(200);

    expect(prisma.shift.updateMany).not.toHaveBeenCalled();
    expect(prisma.shift.update.mock.calls[0][0].data.actualEnd).toEqual(k("14:30"));
    expect(res.body.actualMinutes).toBe(450);
  });

  test("the clock-out lands on the attendance row the clock-in opened", async () => {
    at(k("11:00"));
    prisma.shift.findFirst.mockResolvedValue(
      slot("s-morning", "07:00", "11:00", { status: "IN_PROGRESS", actualStart: k("07:05") }),
    );
    prisma.shift.findMany.mockResolvedValue([]);

    await clockOut().expect(200);

    expect(prisma.attendanceRecord.updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, driverId: DRIVER.id, date: localMidnight(k("07:05")) },
      data: { darbClockOut: k("11:00") },
    });
  });
});

describe("staff shift creation", () => {
  const sameDay = [
    slot("s-morning", "07:00", "11:00"),
    slot("s-afternoon", "14:00", "18:00"),
  ];
  const body = (start: string, end: string) => ({
    driverId: DRIVER.id,
    platform: "TALABAT",
    date: "2026-10-15",
    scheduledStart: k(start).toISOString(),
    scheduledEnd: k(end).toISOString(),
  });

  test("a slot in the gap between two of the day's shifts is created", async () => {
    prisma.shift.findMany.mockResolvedValue(sameDay);
    prisma.shift.create.mockResolvedValue({ id: "s-new" });

    await request(staffApp()).post("/api/shifts").send(body("11:00", "14:00")).expect(201);

    expect(prisma.shift.create).toHaveBeenCalled();
  });

  test("an overlap with the day's SECOND shift is refused, not only the first", async () => {
    prisma.shift.findMany.mockResolvedValue(sameDay);

    const res = await request(staffApp()).post("/api/shifts").send(body("15:00", "17:00")).expect(409);

    expect(res.body.error).toMatch(/already has a shift at that time/);
    expect(prisma.shift.create).not.toHaveBeenCalled();
  });

  test("without times, any shift that day still blocks", async () => {
    prisma.shift.findMany.mockResolvedValue(sameDay);

    await request(staffApp())
      .post("/api/shifts")
      .send({ driverId: DRIVER.id, platform: "TALABAT", date: "2026-10-15" })
      .expect(409);
  });
});

describe("GET /api/shift-planning/bookings", () => {
  const rows = [
    { id: "r1", driverId: "drv-1", startTime: "07:00", endTime: "11:00", zoneName: "Salmiya", status: "APPROVED", driver: { name: "Amal", driverCode: "D-1", phone: "1" } },
    { id: "r2", driverId: "drv-1", startTime: "11:00", endTime: "14:00", zoneName: "Salmiya", status: "APPROVED", driver: { name: "Amal", driverCode: "D-1", phone: "1" } },
    { id: "r3", driverId: "drv-1", startTime: "14:00", endTime: "18:00", zoneName: "Salmiya", status: "APPROVED", driver: { name: "Amal", driverCode: "D-1", phone: "1" } },
    { id: "r4", driverId: "drv-1", startTime: "18:00", endTime: "19:00", zoneName: "Salmiya", status: "APPROVED", driver: { name: "Amal", driverCode: "D-1", phone: "1" } },
    { id: "r5", driverId: "drv-2", startTime: "22:00", endTime: "01:00", zoneName: "Hawally", status: "PENDING", driver: { name: "Badr", driverCode: null, phone: null } },
  ];

  test("groups the Kuwait day per driver against 12 hours, short days first, 4+3+4+1 is a full duty", async () => {
    prisma.shiftRequest.findMany.mockResolvedValue(rows);

    const res = await request(staffApp()).get("/api/shift-planning/bookings?date=2026-10-15").expect(200);

    expect(prisma.shiftRequest.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: TENANT,
      date: KUWAIT_DAY,
      status: { in: ["PENDING", "APPROVED"] },
    });
    expect(res.body.date).toBe("2026-10-15");
    expect(res.body.targetMinutes).toBe(720);
    expect(res.body.summary).toEqual({ drivers: 2, fullDuty: 1, short: 1, bookedMinutes: 720 + 180 });
    expect(res.body.drivers.map((d: any) => [d.driverId, d.bookedMinutes])).toEqual([
      ["drv-2", 180],
      ["drv-1", 720],
    ]);
    // A slot crossing midnight is three hours, not minus twenty-one.
    expect(res.body.drivers[0].slots[0]).toMatchObject({ start: "22:00", end: "01:00", durationMinutes: 180 });
  });

  test("a malformed date falls back to today on the Kuwait calendar", async () => {
    at(k("01:30"));
    prisma.shiftRequest.findMany.mockResolvedValue([]);

    const res = await request(staffApp()).get("/api/shift-planning/bookings?date=tomorrow").expect(200);

    expect(res.body.date).toBe("2026-10-15");
    expect(res.body.summary).toEqual({ drivers: 0, fullDuty: 0, short: 0, bookedMinutes: 0 });
  });
});
