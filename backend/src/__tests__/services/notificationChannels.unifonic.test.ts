/**
 * Phase 9 Wave 0 RED test — turns GREEN in Wave 3 when
 * `backend/src/services/notification/unifonicSms.ts` exports sendSmsUnifonic
 * with the documented Unifonic REST API shape + Twilio fallback path.
 *
 * Contract (from 09-00-PLAN.md):
 *   sendSmsUnifonic(args: { phone; message; senderId; appSid }):
 *     Promise<{ ok: boolean; provider: 'unifonic'|'twilio-fallback'; error?: string }>
 */

function loadSender() {
  return require("../../services/notification/unifonicSms");
}

const originalFetch = (global as any).fetch;

afterAll(() => {
  (global as any).fetch = originalFetch;
});

describe("sendSmsUnifonic — Wave 0 RED", () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
    delete process.env.UNIFONIC_APP_SID;
  });

  test("posts to api.unifonic.com/rest/SMS/messages when AppSid present", async () => {
    process.env.UNIFONIC_APP_SID = "appsid-test-1";
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: "true",
        message: "Success",
        data: { MessageID: "abc-123", Status: "Success" },
      }),
    });
    const { sendSmsUnifonic } = loadSender();
    await sendSmsUnifonic({
      phone: "+96599887766",
      message: "Hello",
      senderId: "DARB",
      appSid: "appsid-test-1",
    });
    expect((global as any).fetch).toHaveBeenCalledWith(
      expect.stringMatching(/api\.unifonic\.com/),
      expect.any(Object),
    );
  });

  test("returns ok:true with provider='unifonic' on Unifonic 200", async () => {
    process.env.UNIFONIC_APP_SID = "appsid-test-1";
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: "true",
        message: "Success",
        data: { MessageID: "abc-123" },
      }),
    });
    const { sendSmsUnifonic } = loadSender();
    const result = await sendSmsUnifonic({
      phone: "+96599887766",
      message: "Hello",
      senderId: "DARB",
      appSid: "appsid-test-1",
    });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("unifonic");
  });

  test("falls back to provider='twilio-fallback' when UNIFONIC_APP_SID env var absent", async () => {
    delete process.env.UNIFONIC_APP_SID;
    const { sendSmsUnifonic } = loadSender();
    const result = await sendSmsUnifonic({
      phone: "+96599887766",
      message: "Hello",
      senderId: "DARB",
      appSid: "",
    });
    expect(result.provider).toBe("twilio-fallback");
  });

  test("returns ok:false on Unifonic 4xx", async () => {
    process.env.UNIFONIC_APP_SID = "appsid-test-1";
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        success: "false",
        errorCode: "B0017",
        message: "Invalid AppSid",
      }),
    });
    const { sendSmsUnifonic } = loadSender();
    const result = await sendSmsUnifonic({
      phone: "+96599887766",
      message: "Hello",
      senderId: "DARB",
      appSid: "appsid-test-1",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("encodes Arabic body as UTF-8 (Unifonic uses application/x-www-form-urlencoded)", async () => {
    process.env.UNIFONIC_APP_SID = "appsid-test-1";
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: "true", message: "Success", data: {} }),
    });
    const { sendSmsUnifonic } = loadSender();
    await sendSmsUnifonic({
      phone: "+96599887766",
      message: "مرحبا محمد",
      senderId: "DARB",
      appSid: "appsid-test-1",
    });
    const [, options] = (global as any).fetch.mock.calls[0];
    // Body MUST contain the Arabic text — either raw or URL-encoded.
    const bodyStr = String(options.body ?? "");
    const containsArabic = /مرحبا/.test(bodyStr) || /%D9%85%D8%B1%D8%AD%D8%A8%D8%A7/i.test(bodyStr);
    expect(containsArabic).toBe(true);
  });

  test("rejects when phone is empty", async () => {
    process.env.UNIFONIC_APP_SID = "appsid-test-1";
    const { sendSmsUnifonic } = loadSender();
    const result = await sendSmsUnifonic({
      phone: "",
      message: "Hello",
      senderId: "DARB",
      appSid: "appsid-test-1",
    });
    expect(result.ok).toBe(false);
  });
});
