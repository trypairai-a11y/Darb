// /api/integrations: Shopify and Salla order webhooks (client note,
// 2026-08-16, "more than Foodics"). Public router, so the per-shop signature is
// the only thing between it and the internet; tested directly like partner.

import express from "express";
import request from "supertest";
import { createHmac } from "crypto";
import { getMockPrisma, resetAllMocks } from "../setup";

const prisma = getMockPrisma();
prisma.vendor = prisma.vendor ?? {};
prisma.vendor.findFirst = prisma.vendor.findFirst ?? jest.fn();
prisma.deliveryOrder = prisma.deliveryOrder ?? {};
prisma.deliveryOrder.findFirst = prisma.deliveryOrder.findFirst ?? jest.fn();
prisma.vendorBranch = prisma.vendorBranch ?? {};
prisma.vendorBranch.findFirst = prisma.vendorBranch.findFirst ?? jest.fn();

jest.mock("../../services/orderService", () => ({
  createDeliveryOrder: jest.fn(),
}));
const { createDeliveryOrder } = require("../../services/orderService");

import storeIntegrationsRouter from "../../routes/storeIntegrations";

const SHOPIFY_SECRET = "shpss_test_secret_123";
const SALLA_SECRET = "salla_test_secret_456";

const VENDOR = {
  id: "v-1",
  tenantId: "t-1",
  integrationSettings: {
    Shopify: "royal-store.myshopify.com",
    shopify: { webhookSecret: SHOPIFY_SECRET, branchId: "b-1" },
    salla: { webhookSecret: SALLA_SECRET, branchId: "b-1" },
  },
};

const CREATED = {
  id: "ord-1",
  orderNumber: "DRB-ROYL-0001",
  externalRef: "shopify:5512345678901",
  status: "DISPATCHING",
  rejectionReason: null,
  trackingToken: "tok_abc",
  createdAt: new Date("2026-10-05T10:00:00Z"),
};

/** Mounted the way server.ts mounts it: ahead of any JSON parser. */
function makeApp() {
  const app = express();
  app.use("/api/integrations", storeIntegrationsRouter);
  return app;
}

// ─── Sample payloads ────────────────────────────────────────────────────────

const SHOPIFY_ORDER = {
  id: 5512345678901,
  name: "#1001",
  currency: "KWD",
  total_price: "12.750",
  financial_status: "pending",
  gateway: "Cash on Delivery (COD)",
  payment_gateway_names: ["Cash on Delivery (COD)"],
  phone: null,
  customer: { first_name: "Abdullah", last_name: "Al-Sabah", phone: "+96550000009" },
  shipping_address: {
    name: "Abdullah Al-Sabah",
    phone: "+96550000001",
    address1: "Block 2, Street 10, House 5",
    address2: "",
    city: "Salmiya",
    province: "Hawalli",
    zip: "",
    latitude: 29.3375,
    longitude: 48.0758,
  },
};

const SALLA_ORDER = {
  event: "order.created",
  merchant: 1234509876,
  created_at: "2026-10-05 13:00:00",
  data: {
    id: 278931234,
    reference_id: 94812345,
    payment_method: "cod",
    amounts: { total: { amount: 8.5, currency: "KWD" } },
    customer: { first_name: "Fatma", last_name: "Al-Ali", mobile: "50000002", mobile_code: "+965" },
    shipping: {
      receiver: { name: "Fatma Al-Ali", phone: "+96550000002" },
      address: {
        country: "Kuwait",
        city: "Jabriya",
        shipping_address: "Block 1A, Street 3, House 12",
        street_number: "",
        block: "1A",
        geo_coordinates: { lat: "29.3270", lng: "48.0220" },
      },
    },
  },
};

function shopifySign(raw: string, secret = SHOPIFY_SECRET) {
  return createHmac("sha256", secret).update(raw, "utf8").digest("base64");
}
function sallaSign(raw: string, secret = SALLA_SECRET) {
  return createHmac("sha256", secret).update(raw, "utf8").digest("hex");
}

function postShopify(body: unknown, opts: { sig?: string; topic?: string; vendorId?: string } = {}) {
  const raw = JSON.stringify(body);
  return request(makeApp())
    .post(`/api/integrations/shopify/${opts.vendorId ?? "v-1"}/orders`)
    .set("Content-Type", "application/json")
    .set("X-Shopify-Topic", opts.topic ?? "orders/create")
    .set("X-Shopify-Hmac-Sha256", opts.sig ?? shopifySign(raw))
    .send(raw);
}

function postSalla(body: unknown, headers: Record<string, string> | null = null) {
  const raw = JSON.stringify(body);
  const req = request(makeApp())
    .post("/api/integrations/salla/v-1/orders")
    .set("Content-Type", "application/json");
  const h = headers ?? { "X-Salla-Security-Strategy": "Signature", "X-Salla-Signature": sallaSign(raw) };
  for (const [k, v] of Object.entries(h)) req.set(k, v);
  return req.send(raw);
}

beforeEach(() => {
  resetAllMocks();
  jest.clearAllMocks();
  prisma.vendor.findFirst.mockResolvedValue(VENDOR);
  prisma.deliveryOrder.findFirst.mockResolvedValue(null);
  prisma.vendorBranch.findFirst.mockResolvedValue({ id: "b-1" });
  createDeliveryOrder.mockResolvedValue(CREATED);
});

// ─── Shopify ────────────────────────────────────────────────────────────────

describe("Shopify orders webhook", () => {
  test("valid signature creates the order through createDeliveryOrder", async () => {
    const res = await postShopify(SHOPIFY_ORDER);
    expect(res.status).toBe(201);
    expect(res.body.orderNumber).toBe("DRB-ROYL-0001");
    expect(createDeliveryOrder).toHaveBeenCalledTimes(1);
    const input = createDeliveryOrder.mock.calls[0][0];
    expect(input).toMatchObject({
      tenantId: "t-1",
      source: "PARTNER_API",
      vendorId: "v-1",
      branchId: "b-1",
      paymentMethod: "COD",
      orderTotalKwd: "12.750",
      customerName: "Abdullah Al-Sabah",
      customerPhone: "+96550000001",
      dropoffAddress: "Block 2, Street 10, House 5, Salmiya, Hawalli",
      dropoff: { lat: 29.3375, lng: 48.0758 },
      externalRef: "shopify:5512345678901",
    });
    expect(input.metadata.platform).toBe("shopify");
  });

  test("a paid online order maps to PREPAID", async () => {
    const res = await postShopify(
      { ...SHOPIFY_ORDER, financial_status: "paid", gateway: "shopify_payments", payment_gateway_names: ["shopify_payments"] },
      { topic: "orders/paid" },
    );
    expect(res.status).toBe(201);
    expect(createDeliveryOrder.mock.calls[0][0].paymentMethod).toBe("PREPAID");
  });

  test("bad signature is 401 and creates nothing", async () => {
    const res = await postShopify(SHOPIFY_ORDER, { sig: shopifySign(JSON.stringify(SHOPIFY_ORDER), "wrong-secret") });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/signature/i);
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });

  test("a body altered after signing is 401", async () => {
    const sig = shopifySign(JSON.stringify(SHOPIFY_ORDER));
    const res = await postShopify({ ...SHOPIFY_ORDER, total_price: "0.100" }, { sig });
    expect(res.status).toBe(401);
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });

  test("a shop with no Shopify secret configured is 401", async () => {
    prisma.vendor.findFirst.mockResolvedValue({ ...VENDOR, integrationSettings: { Shopify: "x" } });
    const res = await postShopify(SHOPIFY_ORDER);
    expect(res.status).toBe(401);
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });

  test("duplicate externalRef returns the existing order with 200", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue(CREATED);
    const res = await postShopify(SHOPIFY_ORDER);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("ord-1");
    expect(createDeliveryOrder).not.toHaveBeenCalled();
    expect(prisma.deliveryOrder.findFirst.mock.calls[0][0].where).toEqual({
      tenantId: "t-1",
      vendorId: "v-1",
      externalRef: "shopify:5512345678901",
    });
  });

  test("insert race on externalRef answers with the winner's row", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(CREATED);
    createDeliveryOrder.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const res = await postShopify(SHOPIFY_ORDER);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("ord-1");
  });

  test("an unsupported topic is 422", async () => {
    const res = await postShopify(SHOPIFY_ORDER, { topic: "products/update" });
    expect(res.status).toBe(422);
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });

  test("an order with no shipping address is 422", async () => {
    const res = await postShopify({ ...SHOPIFY_ORDER, shipping_address: null });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/shipping_address/);
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });

  test("a non-KWD order is 422", async () => {
    const res = await postShopify({ ...SHOPIFY_ORDER, currency: "SAR" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/KWD/);
  });

  test("no branch configured is 422 and creates nothing", async () => {
    prisma.vendor.findFirst.mockResolvedValue({
      ...VENDOR,
      integrationSettings: { shopify: { webhookSecret: SHOPIFY_SECRET } },
    });
    const res = await postShopify(SHOPIFY_ORDER);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/branch/i);
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });

  test("missing coordinates pass through so intake rejects NO_COORDINATES like partner orders", async () => {
    const { latitude, longitude, ...shipNoPin } = SHOPIFY_ORDER.shipping_address;
    void latitude;
    void longitude;
    const res = await postShopify({ ...SHOPIFY_ORDER, shipping_address: shipNoPin });
    expect(res.status).toBe(201);
    expect(createDeliveryOrder.mock.calls[0][0].dropoff).toEqual({ lat: undefined, lng: undefined });
  });
});

// ─── Salla ──────────────────────────────────────────────────────────────────

describe("Salla orders webhook", () => {
  test("valid X-Salla-Signature creates the order", async () => {
    createDeliveryOrder.mockResolvedValue({ ...CREATED, externalRef: "salla:278931234" });
    const res = await postSalla(SALLA_ORDER);
    expect(res.status).toBe(201);
    const input = createDeliveryOrder.mock.calls[0][0];
    expect(input).toMatchObject({
      tenantId: "t-1",
      source: "PARTNER_API",
      branchId: "b-1",
      paymentMethod: "COD",
      orderTotalKwd: "8.500",
      customerName: "Fatma Al-Ali",
      customerPhone: "+96550000002",
      dropoffAddress: "Block 1A, Street 3, House 12, Jabriya",
      dropoff: { lat: 29.327, lng: 48.022 },
      externalRef: "salla:278931234",
    });
  });

  test("the Token strategy is accepted with the stored secret as bearer", async () => {
    const res = await postSalla(SALLA_ORDER, {
      "X-Salla-Security-Strategy": "Token",
      Authorization: `Bearer ${SALLA_SECRET}`,
    });
    expect(res.status).toBe(201);
  });

  test("Token strategy with the wrong token is 401", async () => {
    const res = await postSalla(SALLA_ORDER, {
      "X-Salla-Security-Strategy": "Token",
      Authorization: "Bearer nope",
    });
    expect(res.status).toBe(401);
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });

  test("bad signature is 401 and creates nothing", async () => {
    const res = await postSalla(SALLA_ORDER, {
      "X-Salla-Security-Strategy": "Signature",
      "X-Salla-Signature": sallaSign(JSON.stringify(SALLA_ORDER), "wrong-secret"),
    });
    expect(res.status).toBe(401);
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });

  test("missing signature header is 401", async () => {
    const res = await postSalla(SALLA_ORDER, {});
    expect(res.status).toBe(401);
  });

  test("duplicate externalRef returns the existing order with 200", async () => {
    prisma.deliveryOrder.findFirst.mockResolvedValue({ ...CREATED, externalRef: "salla:278931234" });
    const res = await postSalla(SALLA_ORDER);
    expect(res.status).toBe(200);
    expect(res.body.externalRef).toBe("salla:278931234");
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });

  test("a prepaid order maps to PREPAID", async () => {
    const res = await postSalla({ ...SALLA_ORDER, data: { ...SALLA_ORDER.data, payment_method: "credit_card" } });
    expect(res.status).toBe(201);
    expect(createDeliveryOrder.mock.calls[0][0].paymentMethod).toBe("PREPAID");
  });

  test("another event is 422", async () => {
    const res = await postSalla({ ...SALLA_ORDER, event: "order.updated" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/order\.created/);
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });

  test("an unmappable payload (no data.id) is 422", async () => {
    const res = await postSalla({ event: "order.created", data: {} });
    expect(res.status).toBe(422);
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });

  test("a body that is not JSON is 400", async () => {
    const raw = "not json";
    const res = await request(makeApp())
      .post("/api/integrations/salla/v-1/orders")
      .set("Content-Type", "application/json")
      .set("X-Salla-Signature", sallaSign(raw))
      .send(raw);
    expect(res.status).toBe(400);
    expect(createDeliveryOrder).not.toHaveBeenCalled();
  });
});
