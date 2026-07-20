// Customer WhatsApp thread (PRD §12): co-branded bilingual milestone
// messages with the tracking link, deduped per (order, milestone) via
// OrderEvent so cron-driven lifecycle retries never double-text.

import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();
prisma.deliveryOrder = prisma.deliveryOrder ?? {};
prisma.deliveryOrder.findFirst = prisma.deliveryOrder.findFirst ?? jest.fn();
prisma.orderEvent = prisma.orderEvent ?? {};
for (const fn of ["findFirst", "create"]) {
  prisma.orderEvent[fn] = prisma.orderEvent[fn] ?? jest.fn();
}

jest.mock("../../services/notificationChannels", () => ({
  sendWhatsApp: jest.fn().mockResolvedValue({ ok: true, channel: "whatsapp" }),
}));
const { sendWhatsApp } = require("../../services/notificationChannels");
const {
  notifyCustomerMilestone,
  buildMilestoneMessage,
} = require("../../services/customerMessagingService");

const ORDER = {
  id: "ord-1",
  orderNumber: "DRB-ROYL-0001",
  customerPhone: "+96550000001",
  trackingToken: "tok_abc123456789",
  vendor: { name: "Royal Pharmacy", nameAr: "صيدلية رويال" },
  driver: { name: "Muhammad Iqbal" },
};

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  process.env.PUBLIC_TRACKING_BASE_URL = "https://frontend-ebon-nine-34.vercel.app";
  prisma.deliveryOrder.findFirst.mockResolvedValue(ORDER);
  prisma.orderEvent.findFirst.mockResolvedValue(null);
  prisma.orderEvent.create.mockResolvedValue({ id: "evt" });
});

describe("buildMilestoneMessage", () => {
  test("co-branded EN + AR with the merchant's brand and 'delivered by Darb'", () => {
    const msg = buildMilestoneMessage({
      milestone: "PICKED_UP",
      vendorName: "Royal Pharmacy",
      vendorNameAr: "صيدلية رويال",
      orderNumber: "DRB-ROYL-0001",
      url: "https://x/track/tok",
    });
    expect(msg).toContain("Royal Pharmacy");
    expect(msg).toContain("delivered by Darb");
    expect(msg).toContain("صيدلية رويال");
    expect(msg).toContain("درب");
    expect(msg).toContain("https://x/track/tok");
  });

  test("DELIVERED message invites rating/tip via the tracking link", () => {
    const msg = buildMilestoneMessage({
      milestone: "DELIVERED",
      vendorName: "Royal Pharmacy",
      orderNumber: "DRB-ROYL-0001",
      url: "https://x/track/tok",
    });
    expect(msg.toLowerCase()).toContain("rate");
    expect(msg.toLowerCase()).toContain("tip");
  });
});

describe("notifyCustomerMilestone", () => {
  test("sends via the WhatsApp seam with the tracking URL and dedupes via OrderEvent", async () => {
    await notifyCustomerMilestone("ord-1", "t-1", "ASSIGNED");

    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    const [phone, message] = sendWhatsApp.mock.calls[0];
    expect(phone).toBe("+96550000001");
    expect(message).toContain("/track/tok_abc123456789");
    expect(prisma.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "notify.whatsapp.assigned" }),
      }),
    );
  });

  test("an existing dedupe event means NO second send", async () => {
    prisma.orderEvent.findFirst.mockResolvedValue({ id: "evt-existing" });
    await notifyCustomerMilestone("ord-1", "t-1", "ASSIGNED");
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  test("no customer phone ⇒ silent no-op", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...ORDER, customerPhone: null });
    await notifyCustomerMilestone("ord-1", "t-1", "CREATED");
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  test("a channel failure never throws (fire-and-forget contract)", async () => {
    sendWhatsApp.mockRejectedValue(new Error("twilio down"));
    await expect(notifyCustomerMilestone("ord-1", "t-1", "DELIVERED")).resolves.toBeUndefined();
  });
});
