// GET /api/cron/dispatch-sweep — authorization boundary.
//
// This endpoint is mounted BEFORE authMiddleware/tenantScope and mutates
// DispatchOffer and CourierOnlineSession rows across EVERY tenant. The Bearer
// check is the only thing between it and the open internet, so it is tested
// directly rather than implicitly. The fail-closed case matters most: an unset
// CRON_SECRET must disable the endpoint, never expose it.

import express from "express";
import request from "supertest";

jest.mock("../../services/dispatch/dispatchEngine", () => ({
  sweepDispatch: jest.fn().mockResolvedValue({
    expired: 2,
    advanced: 1,
    wedged: 1,
    truncated: false,
  }),
}));
jest.mock("../../services/gpsMonitorService", () => ({
  sweepStalePresence: jest.fn().mockResolvedValue(3),
}));
jest.mock("../../services/orderService", () => ({
  sweepScheduledOrders: jest.fn().mockResolvedValue(2),
}));

const { sweepDispatch } = require("../../services/dispatch/dispatchEngine");
const { sweepStalePresence } = require("../../services/gpsMonitorService");
const { sweepScheduledOrders } = require("../../services/orderService");
import cronRouter from "../../routes/cron";

const SECRET = "s3cr3t-cron-token";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/cron", cronRouter);
  return app;
}

const originalSecret = process.env.CRON_SECRET;

afterAll(() => {
  process.env.CRON_SECRET = originalSecret;
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
});

describe("cron authorization", () => {
  test("FAIL CLOSED: unset CRON_SECRET disables the endpoint entirely", async () => {
    delete process.env.CRON_SECRET;

    const res = await request(makeApp()).get("/api/cron/dispatch-sweep");

    expect(res.status).toBe(503);
    expect(sweepDispatch).not.toHaveBeenCalled();
    expect(sweepStalePresence).not.toHaveBeenCalled();
  });

  test("FAIL CLOSED: an empty CRON_SECRET does not become an open endpoint", async () => {
    process.env.CRON_SECRET = "";

    const res = await request(makeApp()).get("/api/cron/dispatch-sweep");

    expect(res.status).toBe(503);
    expect(sweepDispatch).not.toHaveBeenCalled();
  });

  test("401 with no Authorization header", async () => {
    const res = await request(makeApp()).get("/api/cron/dispatch-sweep");

    expect(res.status).toBe(401);
    expect(sweepDispatch).not.toHaveBeenCalled();
  });

  test("401 on a wrong secret", async () => {
    const res = await request(makeApp())
      .get("/api/cron/dispatch-sweep")
      .set("Authorization", "Bearer wrong-token-same-len");

    expect(res.status).toBe(401);
    expect(sweepDispatch).not.toHaveBeenCalled();
  });

  test("401 when the secret is right but the scheme is not Bearer", async () => {
    const res = await request(makeApp())
      .get("/api/cron/dispatch-sweep")
      .set("Authorization", `Basic ${SECRET}`);

    expect(res.status).toBe(401);
    expect(sweepDispatch).not.toHaveBeenCalled();
  });

  test("401 on a bare secret with no scheme", async () => {
    const res = await request(makeApp())
      .get("/api/cron/dispatch-sweep")
      .set("Authorization", SECRET);

    expect(res.status).toBe(401);
    expect(sweepDispatch).not.toHaveBeenCalled();
  });

  test("401 on a prefix of the real secret", async () => {
    const res = await request(makeApp())
      .get("/api/cron/dispatch-sweep")
      .set("Authorization", `Bearer ${SECRET.slice(0, -1)}`);

    expect(res.status).toBe(401);
    expect(sweepDispatch).not.toHaveBeenCalled();
  });

  test("200 with the correct Bearer secret, and it runs both sweeps", async () => {
    const res = await request(makeApp())
      .get("/api/cron/dispatch-sweep")
      .set("Authorization", `Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      presenceOffline: 3,
      scheduledAdvanced: 2,
      expired: 2,
      advanced: 1,
    });
    expect(sweepStalePresence).toHaveBeenCalledTimes(1);
    expect(sweepScheduledOrders).toHaveBeenCalledTimes(1);
    expect(sweepDispatch).toHaveBeenCalledTimes(1);
  });
});

describe("cron sweep behaviour", () => {
  test("a presence failure still lets the dispatch sweep run", async () => {
    (sweepStalePresence as jest.Mock).mockRejectedValueOnce(new Error("gps down"));

    const res = await request(makeApp())
      .get("/api/cron/dispatch-sweep")
      .set("Authorization", `Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    expect(res.body.presenceOffline).toBe(0);
    expect(sweepDispatch).toHaveBeenCalledTimes(1);
  });

  test("a scheduled-orders failure still lets the dispatch sweep run", async () => {
    (sweepScheduledOrders as jest.Mock).mockRejectedValueOnce(new Error("db hiccup"));

    const res = await request(makeApp())
      .get("/api/cron/dispatch-sweep")
      .set("Authorization", `Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    expect(res.body.scheduledAdvanced).toBe(0);
    expect(sweepDispatch).toHaveBeenCalledTimes(1);
  });

  test("a dispatch sweep failure surfaces as a 500 so the cron run is visibly failed", async () => {
    (sweepDispatch as jest.Mock).mockRejectedValueOnce(new Error("db down"));

    const res = await request(makeApp())
      .get("/api/cron/dispatch-sweep")
      .set("Authorization", `Bearer ${SECRET}`);

    expect(res.status).toBe(500);
  });
});
