/**
 * Phase 9 Wave 0 RED test — turns GREEN in Wave 1 when
 * `backend/src/services/expoPushService.ts` exports sendExpoPush with the
 * documented Expo push API shape, Android channelId='darb-inbox', 429 retry,
 * and DeviceNotRegistered → null Driver.expoPushToken handling.
 *
 * Contract (from 09-00-PLAN.md):
 *   sendExpoPush(messages: Array<{ to; title; body; data?; badge?; channelId? }>):
 *     Promise<Array<{ status: 'ok'|'error'; message?: string;
 *       details?: { error?: string } }>>
 */

import { prisma } from "../mocks/config";

function loadService() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("../../services/expoPushService");
}

const originalFetch = (global as any).fetch;

afterAll(() => {
  (global as any).fetch = originalFetch;
});

describe("sendExpoPush — Wave 0 RED", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
    delete process.env.EXPO_ACCESS_TOKEN;
  });

  test("posts to https://exp.host/--/api/v2/push/send", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ status: "ok", id: "msg-1" }] }),
    });
    const { sendExpoPush } = loadService();
    await sendExpoPush([
      {
        to: "ExponentPushToken[abc-123]",
        title: "Hi",
        body: "Body",
      },
    ]);
    expect((global as any).fetch).toHaveBeenCalledWith(
      expect.stringMatching(/exp\.host\/--\/api\/v2\/push\/send/),
      expect.any(Object),
    );
  });

  test("payload is an array of message objects", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ status: "ok" }, { status: "ok" }] }),
    });
    const { sendExpoPush } = loadService();
    await sendExpoPush([
      { to: "ExponentPushToken[abc-1]", title: "A", body: "a" },
      { to: "ExponentPushToken[abc-2]", title: "B", body: "b" },
    ]);
    const [, options] = (global as any).fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
  });

  test("includes Android channelId='darb-inbox' in every message (Pitfall 1)", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ status: "ok" }] }),
    });
    const { sendExpoPush } = loadService();
    await sendExpoPush([{ to: "ExponentPushToken[abc-1]", title: "A", body: "a" }]);
    const [, options] = (global as any).fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body[0].channelId).toBe("darb-inbox");
  });

  test("returns the .data array from Expo response", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { status: "ok", id: "msg-1" },
          { status: "error", message: "DeviceNotRegistered" },
        ],
      }),
    });
    const { sendExpoPush } = loadService();
    const tickets = await sendExpoPush([
      { to: "ExponentPushToken[abc-1]", title: "A", body: "a" },
      { to: "ExponentPushToken[abc-2]", title: "B", body: "b" },
    ]);
    expect(Array.isArray(tickets)).toBe(true);
    expect(tickets.length).toBe(2);
    expect(tickets[0].status).toBe("ok");
    expect(tickets[1].status).toBe("error");
  });

  test("retries on HTTP 429 with backoff (max 3 attempts)", async () => {
    const fetchMock = jest.fn();
    // First two calls: 429. Third: 200.
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ errors: [{ message: "Too many requests" }] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ errors: [{ message: "Too many requests" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ status: "ok" }] }),
      });
    (global as any).fetch = fetchMock;
    const { sendExpoPush } = loadService();
    const tickets = await sendExpoPush([
      { to: "ExponentPushToken[abc-1]", title: "A", body: "a" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(tickets[0]?.status).toBe("ok");
  }, 15000);

  test("nulls Driver.expoPushToken when Expo returns status='error' with details.error='DeviceNotRegistered' (Pitfall 4)", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            status: "error",
            message: "Device is not registered",
            details: { error: "DeviceNotRegistered" },
          },
        ],
      }),
    });
    (prisma.driver.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.driver.update as jest.Mock).mockResolvedValue({ id: "drv1" });
    const { sendExpoPush } = loadService();
    await sendExpoPush([
      { to: "ExponentPushToken[abc-stale]", title: "A", body: "a" },
    ]);
    // Either update or updateMany is acceptable — both clear the token.
    const updateCalled = (prisma.driver.update as jest.Mock).mock.calls.length > 0;
    const updateManyCalled = (prisma.driver.updateMany as jest.Mock).mock.calls.length > 0;
    expect(updateCalled || updateManyCalled).toBe(true);
  });

  test("includes EXPO_ACCESS_TOKEN as Authorization Bearer when env var present", async () => {
    process.env.EXPO_ACCESS_TOKEN = "expo-token-test-1";
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ status: "ok" }] }),
    });
    const { sendExpoPush } = loadService();
    await sendExpoPush([{ to: "ExponentPushToken[abc-1]", title: "A", body: "a" }]);
    const [, options] = (global as any).fetch.mock.calls[0];
    const headers = options.headers ?? {};
    const authHeader = headers["Authorization"] ?? headers["authorization"];
    expect(String(authHeader)).toMatch(/Bearer\s+expo-token-test-1/);
    delete process.env.EXPO_ACCESS_TOKEN;
  });
});
