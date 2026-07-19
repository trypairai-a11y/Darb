/**
 * Phase 9 Wave 0 RED test — turns GREEN in Wave 2 when
 * `backend/src/services/notification/whatsappCloudApi.ts` exports sendWhatsAppCloud
 * with the documented Meta Cloud API v22.0 payload shape.
 *
 * Contract (from 09-00-PLAN.md):
 *   sendWhatsAppCloud(args: { phone; templateName; templateLang;
 *     variables; phoneNumberId; accessToken }):
 *     Promise<{ ok: boolean; provider: 'whatsapp-cloud';
 *       error?: string; metaMessageId?: string }>
 *
 * Today the file does not exist — require() throws Cannot find module.
 * The Wave 2 implementation creates the file and these branches start exercising.
 */

function loadSender() {
  return require("../../services/notification/whatsappCloudApi");
}

const originalFetch = (global as any).fetch;

afterAll(() => {
  (global as any).fetch = originalFetch;
});

describe("sendWhatsAppCloud — Wave 0 RED", () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  test("posts to https://graph.facebook.com/v22.0/{phoneNumberId}/messages", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.XXX" }] }),
    });
    const { sendWhatsAppCloud } = loadSender();
    await sendWhatsAppCloud({
      phone: "+96599887766",
      templateName: "late_clockin_warning_v1",
      templateLang: "ar",
      variables: ["Mohamed"],
      phoneNumberId: "PN-123",
      accessToken: "token-abc",
    });
    expect((global as any).fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /https:\/\/graph\.facebook\.com\/v22\.0\/PN-123\/messages/,
      ),
      expect.any(Object),
    );
  });

  test("body includes messaging_product='whatsapp', type='template', template.name + language.code", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.XXX" }] }),
    });
    const { sendWhatsAppCloud } = loadSender();
    await sendWhatsAppCloud({
      phone: "+96599887766",
      templateName: "late_clockin_warning_v1",
      templateLang: "ar",
      variables: ["Mohamed"],
      phoneNumberId: "PN-123",
      accessToken: "token-abc",
    });
    const [, options] = (global as any).fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("late_clockin_warning_v1");
    expect(body.template.language?.code).toBe("ar");
  });

  test("phone is normalised — leading '+' stripped before send", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.XXX" }] }),
    });
    const { sendWhatsAppCloud } = loadSender();
    await sendWhatsAppCloud({
      phone: "+96599887766",
      templateName: "tpl",
      templateLang: "en",
      variables: [],
      phoneNumberId: "PN-123",
      accessToken: "token-abc",
    });
    const [, options] = (global as any).fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.to).toBe("96599887766");
  });

  test("returns ok:true with metaMessageId on 200", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.HBgL12345" }] }),
    });
    const { sendWhatsAppCloud } = loadSender();
    const result = await sendWhatsAppCloud({
      phone: "+96599887766",
      templateName: "tpl",
      templateLang: "en",
      variables: [],
      phoneNumberId: "PN-123",
      accessToken: "token-abc",
    });
    expect(result.ok).toBe(true);
    expect(result.metaMessageId).toBe("wamid.HBgL12345");
    expect(result.provider).toBe("whatsapp-cloud");
  });

  test("returns ok:false with error message on 400", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: "Template name does not exist in the translation",
          code: 132001,
        },
      }),
    });
    const { sendWhatsAppCloud } = loadSender();
    const result = await sendWhatsAppCloud({
      phone: "+96599887766",
      templateName: "no_such_template",
      templateLang: "ar",
      variables: [],
      phoneNumberId: "PN-123",
      accessToken: "token-abc",
    });
    expect(result.ok).toBe(false);
    expect(result.provider).toBe("whatsapp-cloud");
    expect(result.error).toBeDefined();
  });

  test("returns ok:false with provider='whatsapp-cloud' when accessToken missing", async () => {
    const { sendWhatsAppCloud } = loadSender();
    const result = await sendWhatsAppCloud({
      phone: "+96599887766",
      templateName: "tpl",
      templateLang: "en",
      variables: [],
      phoneNumberId: "PN-123",
      accessToken: "",
    });
    expect(result.ok).toBe(false);
    expect(result.provider).toBe("whatsapp-cloud");
  });

  test("encodes Arabic variables as UTF-8 in JSON body (no \\u escapes leak)", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.XXX" }] }),
    });
    const { sendWhatsAppCloud } = loadSender();
    await sendWhatsAppCloud({
      phone: "+96599887766",
      templateName: "late_clockin_warning_v1",
      templateLang: "ar",
      variables: ["محمد"],
      phoneNumberId: "PN-123",
      accessToken: "token-abc",
    });
    const [, options] = (global as any).fetch.mock.calls[0];
    // The serialised body must contain the Arabic glyph, not \u escapes.
    expect(options.body).toMatch(/محمد/);
  });
});
