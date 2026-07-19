/**
 * Phase 9 Wave 0 RED test — turns GREEN in Wave 1 when
 * `backend/src/services/outboundResolver.ts` exports the documented surface
 * (resolveOutboundChannels + deliver).
 *
 * Contract (excerpted from 09-00-PLAN.md <interfaces>):
 *   type ResolvedOutbound { lang: 'EN'|'AR'; body: string;
 *     channels: Array<'IN_APP_PUSH'|'WHATSAPP'|'SMS'>;
 *     quietHoursSuppressed: boolean }
 *   resolveOutboundChannels(args: { driverId; tenantId; severity }):
 *     Promise<ResolvedOutbound | null>
 *   deliver(args: { tenantId; notificationId; driverId; bodyEn; bodyAr;
 *     channelHint?; severity; intent? }):
 *     Promise<{ enqueued: string[]; suppressed: boolean }>
 *
 * Today the module does not exist on disk; every require() throws
 * "Cannot find module". The Wave 1 implementation stubs the file with the
 * contract above and these tests start exercising real branches.
 */

import { prisma } from "../mocks/config";

// Lazy-load so the file-not-found error happens inside the `it` body
// (Jest reports it as a normal test failure rather than a suite-load crash).
function loadResolver() {
  return require("../../services/outboundResolver");
}

const TENANT_A = "tenant-A";

describe("outboundResolver.resolveOutboundChannels — Wave 0 RED", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns AR body + lang='AR' when Driver.preferredLanguage='AR'", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      tenantId: TENANT_A,
      preferredLanguage: "AR",
      outboundOptIn: true,
      smsOptOut: false,
      expoPushToken: "ExponentPushToken[abc]",
    });
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      defaultLanguage: "EN",
      outboundChannels: { inApp: true, whatsapp: false, sms: false },
      whatsappPhoneNumberId: null,
    });
    const { resolveOutboundChannels } = loadResolver();
    const result = await resolveOutboundChannels({
      driverId: "drv1",
      tenantId: TENANT_A,
      severity: "MEDIUM",
    });
    expect(result?.lang).toBe("AR");
  });

  test("returns EN body + lang='EN' when Driver.preferredLanguage='EN'", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      tenantId: TENANT_A,
      preferredLanguage: "EN",
      outboundOptIn: true,
      smsOptOut: false,
      expoPushToken: "ExponentPushToken[abc]",
    });
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      defaultLanguage: "AR",
      outboundChannels: { inApp: true, whatsapp: false, sms: false },
    });
    const { resolveOutboundChannels } = loadResolver();
    const result = await resolveOutboundChannels({
      driverId: "drv1",
      tenantId: TENANT_A,
      severity: "MEDIUM",
    });
    expect(result?.lang).toBe("EN");
  });

  test("falls back to Tenant.defaultLanguage when Driver.preferredLanguage='AUTO'", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      tenantId: TENANT_A,
      preferredLanguage: "AUTO",
      outboundOptIn: true,
      smsOptOut: false,
      expoPushToken: "ExponentPushToken[abc]",
    });
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      defaultLanguage: "AR",
      outboundChannels: { inApp: true, whatsapp: false, sms: false },
    });
    const { resolveOutboundChannels } = loadResolver();
    const result = await resolveOutboundChannels({
      driverId: "drv1",
      tenantId: TENANT_A,
      severity: "MEDIUM",
    });
    expect(result?.lang).toBe("AR");
  });

  test("returns null + suppressed when Driver.outboundOptIn=false", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      tenantId: TENANT_A,
      preferredLanguage: "AR",
      outboundOptIn: false,
      smsOptOut: false,
    });
    const { resolveOutboundChannels } = loadResolver();
    const result = await resolveOutboundChannels({
      driverId: "drv1",
      tenantId: TENANT_A,
      severity: "MEDIUM",
    });
    expect(result).toBeNull();
  });

  test("returns channel order [IN_APP_PUSH, WHATSAPP, SMS] when all three enabled", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      tenantId: TENANT_A,
      preferredLanguage: "AR",
      outboundOptIn: true,
      smsOptOut: false,
      expoPushToken: "ExponentPushToken[abc]",
    });
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      defaultLanguage: "AR",
      outboundChannels: { inApp: true, whatsapp: true, sms: true },
      whatsappPhoneNumberId: "PN-123",
      whatsappBusinessAccountId: "WABA-1",
    });
    const { resolveOutboundChannels } = loadResolver();
    const result = await resolveOutboundChannels({
      driverId: "drv1",
      tenantId: TENANT_A,
      severity: "HIGH",
    });
    expect(result?.channels).toEqual(["IN_APP_PUSH", "WHATSAPP", "SMS"]);
  });

  test("omits WHATSAPP when Tenant.whatsappPhoneNumberId is null", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      tenantId: TENANT_A,
      preferredLanguage: "AR",
      outboundOptIn: true,
      smsOptOut: false,
      expoPushToken: "ExponentPushToken[abc]",
    });
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      defaultLanguage: "AR",
      outboundChannels: { inApp: true, whatsapp: true, sms: false },
      whatsappPhoneNumberId: null,
    });
    const { resolveOutboundChannels } = loadResolver();
    const result = await resolveOutboundChannels({
      driverId: "drv1",
      tenantId: TENANT_A,
      severity: "HIGH",
    });
    expect(result?.channels).not.toContain("WHATSAPP");
  });

  test("omits SMS when Driver.smsOptOut=true", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      tenantId: TENANT_A,
      preferredLanguage: "AR",
      outboundOptIn: true,
      smsOptOut: true,
      expoPushToken: "ExponentPushToken[abc]",
    });
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      defaultLanguage: "AR",
      outboundChannels: { inApp: true, whatsapp: false, sms: true },
    });
    const { resolveOutboundChannels } = loadResolver();
    const result = await resolveOutboundChannels({
      driverId: "drv1",
      tenantId: TENANT_A,
      severity: "HIGH",
    });
    expect(result?.channels).not.toContain("SMS");
  });

  test("omits IN_APP_PUSH when Driver.expoPushToken is null", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      tenantId: TENANT_A,
      preferredLanguage: "AR",
      outboundOptIn: true,
      smsOptOut: false,
      expoPushToken: null,
    });
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      defaultLanguage: "AR",
      outboundChannels: { inApp: true, whatsapp: false, sms: false },
    });
    const { resolveOutboundChannels } = loadResolver();
    const result = await resolveOutboundChannels({
      driverId: "drv1",
      tenantId: TENANT_A,
      severity: "MEDIUM",
    });
    expect(result?.channels ?? []).not.toContain("IN_APP_PUSH");
  });

  test("quietHoursSuppressed=true between 22:00-06:00 Kuwait time at severity<CRITICAL", async () => {
    // 23:30 Kuwait time = 20:30 UTC. Use fake timers anchored there.
    const KUWAIT_NIGHT_UTC = new Date("2026-05-13T20:30:00.000Z");
    jest.useFakeTimers().setSystemTime(KUWAIT_NIGHT_UTC);
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      tenantId: TENANT_A,
      preferredLanguage: "AR",
      outboundOptIn: true,
      smsOptOut: false,
      expoPushToken: "ExponentPushToken[abc]",
    });
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      defaultLanguage: "AR",
      outboundChannels: { inApp: true, whatsapp: false, sms: false },
    });
    const { resolveOutboundChannels } = loadResolver();
    const result = await resolveOutboundChannels({
      driverId: "drv1",
      tenantId: TENANT_A,
      severity: "MEDIUM",
    });
    expect(result?.quietHoursSuppressed).toBe(true);
    jest.useRealTimers();
  });

  test("ignores quiet hours when severity='CRITICAL'", async () => {
    const KUWAIT_NIGHT_UTC = new Date("2026-05-13T20:30:00.000Z");
    jest.useFakeTimers().setSystemTime(KUWAIT_NIGHT_UTC);
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      tenantId: TENANT_A,
      preferredLanguage: "AR",
      outboundOptIn: true,
      smsOptOut: false,
      expoPushToken: "ExponentPushToken[abc]",
    });
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      defaultLanguage: "AR",
      outboundChannels: { inApp: true, whatsapp: false, sms: false },
    });
    const { resolveOutboundChannels } = loadResolver();
    const result = await resolveOutboundChannels({
      driverId: "drv1",
      tenantId: TENANT_A,
      severity: "CRITICAL",
    });
    expect(result?.quietHoursSuppressed).toBe(false);
    jest.useRealTimers();
  });
});

describe("outboundResolver.deliver — Wave 0 RED", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns suppressed=true + enqueued=[] when driver opted out", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      tenantId: TENANT_A,
      outboundOptIn: false,
      preferredLanguage: "AR",
    });
    const { deliver } = loadResolver();
    const result = await deliver({
      tenantId: TENANT_A,
      notificationId: "ntf-1",
      driverId: "drv1",
      bodyEn: "Hi",
      bodyAr: "مرحبا",
      severity: "MEDIUM",
    });
    expect(result.suppressed).toBe(true);
    expect(result.enqueued).toEqual([]);
  });

  test("enqueues IN_APP_PUSH for severity=MEDIUM when push token present (Stage-1 default)", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      tenantId: TENANT_A,
      preferredLanguage: "AR",
      outboundOptIn: true,
      smsOptOut: false,
      expoPushToken: "ExponentPushToken[abc]",
    });
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      defaultLanguage: "AR",
      outboundChannels: { inApp: true, whatsapp: false, sms: false },
    });
    const { deliver } = loadResolver();
    const result = await deliver({
      tenantId: TENANT_A,
      notificationId: "ntf-1",
      driverId: "drv1",
      bodyEn: "Hi",
      bodyAr: "مرحبا",
      severity: "MEDIUM",
    });
    expect(result.enqueued).toContain("IN_APP_PUSH");
  });

  test("fans out to WHATSAPP and SMS in addition to push when severity=CRITICAL", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      tenantId: TENANT_A,
      preferredLanguage: "AR",
      outboundOptIn: true,
      smsOptOut: false,
      expoPushToken: "ExponentPushToken[abc]",
    });
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      defaultLanguage: "AR",
      outboundChannels: { inApp: true, whatsapp: true, sms: true },
      whatsappPhoneNumberId: "PN-123",
      whatsappBusinessAccountId: "WABA-1",
    });
    const { deliver } = loadResolver();
    const result = await deliver({
      tenantId: TENANT_A,
      notificationId: "ntf-1",
      driverId: "drv1",
      bodyEn: "Hi",
      bodyAr: "مرحبا",
      severity: "CRITICAL",
    });
    expect(result.enqueued).toEqual(
      expect.arrayContaining(["IN_APP_PUSH", "WHATSAPP", "SMS"]),
    );
  });

  test("does NOT exceed Tenant.outboundDailyKdLimit — circuit breaker stops fan-out at 100%", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      tenantId: TENANT_A,
      preferredLanguage: "AR",
      outboundOptIn: true,
      smsOptOut: false,
      expoPushToken: "ExponentPushToken[abc]",
    });
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: TENANT_A,
      defaultLanguage: "AR",
      outboundChannels: { inApp: true, whatsapp: true, sms: true },
      whatsappPhoneNumberId: "PN-123",
      outboundDailyKdLimit: "0.001", // effectively zero — anything triggers it
    });
    (prisma.notificationDelivery.aggregate as jest.Mock).mockResolvedValue({
      _sum: { costKd: "1.000" },
    });
    (prisma.notificationDelivery.count as jest.Mock).mockResolvedValue(50);
    const { deliver } = loadResolver();
    const result = await deliver({
      tenantId: TENANT_A,
      notificationId: "ntf-1",
      driverId: "drv1",
      bodyEn: "Hi",
      bodyAr: "مرحبا",
      severity: "HIGH",
    });
    // Circuit-breaker behaviour: paid channels (WHATSAPP/SMS) drop;
    // IN_APP_PUSH (free) MAY still ship. The contract is the paid channels
    // are NOT enqueued past the daily limit.
    expect(result.enqueued).not.toContain("WHATSAPP");
    expect(result.enqueued).not.toContain("SMS");
  });
});
