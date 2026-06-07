/**
 * Phase 9 Wave 0 RED test — turns GREEN in Wave 1 when:
 *   1. draftCourierMessage's Zod inputValidator REQUIRES bodyArabic (20-500 chars).
 *   2. The execute() body writes BOTH `message` (English) AND `bodyAr` (Arabic) on
 *      Notification.create, plus titleAr = "رسالة إلى " + driver.name.
 *   3. editableParams includes both 'bodyEnglish' AND 'bodyArabic' (Pitfall 10).
 *   4. After Notification.create, the tool calls outboundResolver.deliver(...).
 *   5. When driver.outboundOptIn=false, outboundResolver.deliver is NOT called.
 *
 * The Wave 1 implementation extends `src/agent/tools/action/draftCourierMessage.ts`
 * to require bodyArabic + invoke outboundResolver.deliver. Today the tool is
 * English-only, so the bodyArabic / outboundResolver assertions FAIL.
 *
 * NOTE: outboundResolver does not yet exist on disk. We jest.mock() it via
 * doMock-with-virtual=true so import-resolution doesn't crash before Wave 1
 * stubs the file. The module path mirrors the Wave 1 contract:
 * `backend/src/services/outboundResolver.ts`.
 */

import { prisma } from "../../../__tests__/mocks/config";

// Mock outboundResolver as a virtual module — Wave 1 will create the real file.
jest.mock(
  "../../../services/outboundResolver",
  () => ({
    deliver: jest.fn().mockResolvedValue({ enqueued: ["IN_APP_PUSH"], suppressed: false }),
    resolveOutboundChannels: jest.fn(),
  }),
  { virtual: true },
);

// Helper to lazy-load the tool after the mocks are set up.
function loadTool() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("../../../agent/tools/action/draftCourierMessage").draftCourierMessage;
}

const TENANT_A = "tenant-A";

const ctx = {
  tenantId: TENANT_A,
  agentId: "monitor",
  runId: "run-1",
  actorRole: "ADMIN" as const,
  userId: "approver-1",
};

describe("draftCourierMessage — Phase 9 bilingual extension (Wave 0 RED)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      name: "Mohamed",
      phone: "+96599887766",
      tenantId: TENANT_A,
      outboundOptIn: true,
      preferredLanguage: "AUTO",
    });
    (prisma.notification.create as jest.Mock).mockResolvedValue({
      id: "ntf-1",
      tenantId: TENANT_A,
    });
  });

  test("rejects via Zod when bodyArabic is missing", () => {
    const tool = loadTool();
    const result = tool.inputValidator.safeParse({
      driverId: "drv1",
      intent: "WARN_LATE_CLOCKIN",
      bodyEnglish: "Hi Mohamed, please clock in on time this week.",
      // bodyArabic intentionally absent
    });
    expect(result.success).toBe(false);
  });

  test("rejects when bodyArabic is shorter than 20 chars", () => {
    const tool = loadTool();
    const result = tool.inputValidator.safeParse({
      driverId: "drv1",
      intent: "WARN_LATE_CLOCKIN",
      bodyEnglish: "Hi Mohamed, please clock in on time this week.",
      bodyArabic: "قصير",
    });
    expect(result.success).toBe(false);
  });

  test("rejects when bodyArabic is longer than 500 chars", () => {
    const tool = loadTool();
    const result = tool.inputValidator.safeParse({
      driverId: "drv1",
      intent: "WARN_LATE_CLOCKIN",
      bodyEnglish: "Hi Mohamed, please clock in on time this week.",
      bodyArabic: "ا".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  test("writes both message (English) AND bodyAr (Arabic) on Notification.create", async () => {
    const tool = loadTool();
    await tool.execute(ctx, {
      driverId: "drv1",
      intent: "WARN_LATE_CLOCKIN",
      bodyEnglish: "Hi Mohamed, please clock in on time this week.",
      bodyArabic: "مرحبا محمد، الرجاء الحضور في الوقت هذا الأسبوع.",
    });

    expect(prisma.notification.create).toHaveBeenCalled();
    const call = (prisma.notification.create as jest.Mock).mock.calls[0]?.[0];
    expect(call?.data?.message).toMatch(/Mohamed/);
    expect(call?.data?.bodyAr).toMatch(/محمد/);
  });

  test("sets titleAr to 'رسالة إلى ' + driver.name", async () => {
    const tool = loadTool();
    await tool.execute(ctx, {
      driverId: "drv1",
      intent: "WARN_LATE_CLOCKIN",
      bodyEnglish: "Hi Mohamed, please clock in on time this week.",
      bodyArabic: "مرحبا محمد، الرجاء الحضور في الوقت هذا الأسبوع.",
    });
    const call = (prisma.notification.create as jest.Mock).mock.calls[0]?.[0];
    expect(call?.data?.titleAr).toContain("رسالة");
    expect(call?.data?.titleAr).toContain("Mohamed");
  });

  test("calls outboundResolver.deliver after Notification.create when ctx.userId is set (post-approval path)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const outboundResolver = require("../../../services/outboundResolver");
    const tool = loadTool();
    await tool.execute(ctx, {
      driverId: "drv1",
      intent: "WARN_LATE_CLOCKIN",
      bodyEnglish: "Hi Mohamed, please clock in on time this week.",
      bodyArabic: "مرحبا محمد، الرجاء الحضور في الوقت هذا الأسبوع.",
    });
    expect(outboundResolver.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        driverId: "drv1",
        bodyEn: expect.stringContaining("Mohamed"),
        bodyAr: expect.stringContaining("محمد"),
      }),
    );
  });

  test("editableParams includes both 'bodyEnglish' AND 'bodyArabic' (Pitfall 10 fix)", () => {
    const tool = loadTool();
    expect(tool.editableParams).toContain("bodyEnglish");
    expect(tool.editableParams).toContain("bodyArabic");
  });

  test("DOES NOT call outboundResolver.deliver when driver.outboundOptIn=false — opt-out short-circuits", async () => {
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv1",
      name: "Mohamed",
      phone: "+96599887766",
      tenantId: TENANT_A,
      outboundOptIn: false,
      preferredLanguage: "AR",
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const outboundResolver = require("../../../services/outboundResolver");
    (outboundResolver.deliver as jest.Mock).mockClear();
    const tool = loadTool();
    await tool.execute(ctx, {
      driverId: "drv1",
      intent: "WARN_LATE_CLOCKIN",
      bodyEnglish: "Hi Mohamed, please clock in on time this week.",
      bodyArabic: "مرحبا محمد، الرجاء الحضور في الوقت هذا الأسبوع.",
    });
    expect(outboundResolver.deliver).not.toHaveBeenCalled();
  });

  test("Notification.create metadata.driverId set to input.driverId (Pitfall 9 requirement)", async () => {
    const tool = loadTool();
    await tool.execute(ctx, {
      driverId: "drv1",
      intent: "WARN_LATE_CLOCKIN",
      bodyEnglish: "Hi Mohamed, please clock in on time this week.",
      bodyArabic: "مرحبا محمد، الرجاء الحضور في الوقت هذا الأسبوع.",
    });
    const call = (prisma.notification.create as jest.Mock).mock.calls[0]?.[0];
    expect(call?.data?.metadata?.driverId).toBe("drv1");
  });
});
