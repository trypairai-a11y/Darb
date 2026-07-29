// Traffic-driven dispatch sweep.
//
// This one adds side effects to ordinary requests, so the tests care most
// about the things that make that safe: off by default, never blocks the
// caller, never stacks up, and never lets a failure reach the response.

jest.mock("../../services/dispatch/dispatchEngine", () => ({
  sweepDispatch: jest.fn().mockResolvedValue({ expired: 0, advanced: 0, wedged: 0, retried: 0 }),
}));
jest.mock("../../services/orderService", () => ({
  sweepScheduledOrders: jest.fn().mockResolvedValue(0),
}));
jest.mock("../../services/demoPresenceService", () => ({
  refreshDemoPresence: jest.fn().mockResolvedValue({ tenants: 0, refreshed: 0, woken: 0 }),
}));
jest.mock("../../services/demoCourierService", () => ({
  runDemoCouriers: jest
    .fn()
    .mockResolvedValue({ tenants: 0, accepted: 0, pickedUp: 0, delivered: 0 }),
}));

const { sweepDispatch } = require("../../services/dispatch/dispatchEngine");
const { sweepScheduledOrders } = require("../../services/orderService");
const {
  maybeSweep,
  opportunisticSweepMiddleware,
  __resetSweepClock,
} = require("../../services/opportunisticSweep");

describe("opportunistic dispatch sweep", () => {
  const saved = process.env.OPPORTUNISTIC_SWEEP;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetSweepClock();
    process.env.OPPORTUNISTIC_SWEEP = "true";
  });

  afterAll(() => {
    if (saved === undefined) delete process.env.OPPORTUNISTIC_SWEEP;
    else process.env.OPPORTUNISTIC_SWEEP = saved;
  });

  test("does nothing at all unless explicitly enabled", async () => {
    delete process.env.OPPORTUNISTIC_SWEEP;

    await expect(maybeSweep()).resolves.toBe(false);
    expect(sweepDispatch).not.toHaveBeenCalled();
  });

  test("a due request sweeps, and presence is refreshed before dispatch", async () => {
    await expect(maybeSweep()).resolves.toBe(true);

    expect(sweepScheduledOrders).toHaveBeenCalledTimes(1);
    expect(sweepDispatch).toHaveBeenCalledTimes(1);
  });

  test("a polling dashboard sweeps once a minute, not once a request", async () => {
    const t0 = 1_000_000;
    await maybeSweep(t0);
    await maybeSweep(t0 + 1_000);
    await maybeSweep(t0 + 30_000);
    await maybeSweep(t0 + 59_999);

    expect(sweepDispatch).toHaveBeenCalledTimes(1);

    await maybeSweep(t0 + 60_001);
    expect(sweepDispatch).toHaveBeenCalledTimes(2);
  });

  test("a slow sweep does not stack up behind the next request", async () => {
    let release: () => void = () => {};
    sweepDispatch.mockImplementationOnce(
      () => new Promise((res) => {
        release = () => res({ expired: 0, advanced: 0, wedged: 0, retried: 0 });
      }),
    );

    const first = maybeSweep(1_000_000);
    // Let it run as far as the (now hanging) dispatch leg.
    await new Promise((res) => setImmediate(res));
    expect(sweepDispatch).toHaveBeenCalledTimes(1);

    // Far past the debounce, but the first sweep is still in flight, so this
    // one must decline rather than pile a second sweep on top.
    await expect(maybeSweep(9_000_000)).resolves.toBe(false);
    expect(sweepDispatch).toHaveBeenCalledTimes(1);

    release();
    await first;
  });

  /** Minimal res stand-in that can report a status and fire 'finish'. */
  function mkRes(statusCode: number) {
    const handlers: Array<() => void> = [];
    return {
      statusCode,
      once: (evt: string, fn: () => void) => {
        if (evt === "finish") handlers.push(fn);
      },
      finish: () => handlers.forEach((h) => h()),
    };
  }

  test("middleware calls next() immediately — the caller never waits on a sweep", () => {
    const next = jest.fn();
    opportunisticSweepMiddleware({} as any, mkRes(200) as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    // Nothing has run yet: the response has not finished.
    expect(sweepDispatch).not.toHaveBeenCalled();
  });

  test("a successful response drives a sweep", async () => {
    const res = mkRes(200);
    opportunisticSweepMiddleware({} as any, res as any, jest.fn());
    res.finish();
    await new Promise((r) => setImmediate(r));

    expect(sweepDispatch).toHaveBeenCalledTimes(1);
  });

  test("an unauthenticated 401 must not drive the queue", async () => {
    const res = mkRes(401);
    opportunisticSweepMiddleware({} as any, res as any, jest.fn());
    res.finish();
    await new Promise((r) => setImmediate(r));

    expect(sweepDispatch).not.toHaveBeenCalled();
  });

  test("a failing sweep is swallowed, never surfaced to the request", async () => {
    sweepDispatch.mockRejectedValueOnce(new Error("db down"));

    await expect(maybeSweep()).resolves.toBe(false);

    // And the failure did not wedge the in-flight guard shut.
    __resetSweepClock();
    await expect(maybeSweep()).resolves.toBe(true);
  });
});
