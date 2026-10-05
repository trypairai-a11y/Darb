/**
 * /api/integrations: order webhooks from store platforms (Shopify, Salla).
 *
 * Client note, 2026-08-16: "for the integrations we should have more than
 * Foodics, such as uPayments, Salla, Shopify, and others, and sometimes it is a
 * custom system." Shopify and Salla push an order here the moment a customer
 * checks out, and it goes through createDeliveryOrder exactly the way a
 * partner-API order does: source PARTNER_API (a new enum value would need a
 * migration; the platform is recorded in metadata instead), idempotent on
 * externalRef, a rejected order still persisted with its reason.
 *
 * PUBLIC router, no JWT. The vendor comes from the path and the request is
 * trusted only after the platform signature checks out against that vendor's
 * own webhook secret (Vendor.integrationSettings.<platform>.webhookSecret).
 * Cross-tenant lookup by design, as with the Foodics hook: a store platform
 * knows nothing about our tenants, so the tenant comes from the vendor row.
 *
 * MOUNTING: server.ts mounts this BEFORE the global express.json, because the
 * signatures are over the exact bytes sent and a re-serialised body does not
 * hash the same. express.raw below is scoped to this router only.
 *
 * Answers:
 *   201 created (or REJECTED with a reason, same contract as /api/partner)
 *   200 replay of an externalRef we already have
 *   401 unknown vendor, platform not configured, or bad signature
 *   422 a payload we cannot turn into a delivery; nothing is created
 */
import express, { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { createDeliveryOrder } from "../services/orderService";
import {
  MapResult,
  SHOPIFY_ORDER_TOPICS,
  StorePlatform,
  mapSallaOrder,
  mapShopifyOrder,
  readPlatformSettings,
  verifySallaSignature,
  verifyShopifySignature,
} from "../services/integrations/storePlatforms";
import { DeliveryOrder } from "../generated/prisma";

const router = Router();

// Mounted ahead of the app-wide limiter, so it carries its own.
const storeLimiter = rateLimit({
  windowMs: 60_000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
});

// Raw bytes for this router only. Shopify order payloads with many line items
// run to a few hundred KB; 5mb leaves room without inviting abuse.
router.use(storeLimiter, express.raw({ type: "*/*", limit: "5mb" }));

/** Same public-safe order view the partner API returns. */
function orderView(order: DeliveryOrder) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    externalRef: order.externalRef,
    status: order.status,
    rejectionReason: order.rejectionReason,
    trackingToken: order.trackingToken,
    createdAt: order.createdAt,
  };
}

/**
 * The exact bytes the platform signed. express.raw leaves a Buffer on
 * req.body; if something upstream already parsed JSON, fall back to the
 * rawBody the global parser's verify hook keeps.
 */
function rawBodyOf(req: Request): Buffer | null {
  if (Buffer.isBuffer(req.body)) return req.body;
  const kept = (req as Request & { rawBody?: Buffer }).rawBody;
  return Buffer.isBuffer(kept) ? kept : null;
}

type Verify = (req: Request, raw: Buffer, secret: string) => boolean;
type Gate = (req: Request, body: unknown) => string | null;

/**
 * One handler for both platforms; they differ only in how the signature is
 * checked, which events are orders, and how the payload maps.
 */
function intakeHandler(platform: StorePlatform, verify: Verify, gate: Gate, map: (body: unknown) => MapResult) {
  return async (req: Request, res: Response) => {
    const vendorId = String(req.params.vendorId ?? "");
    try {
      // eslint-disable-next-line no-restricted-syntax -- inbound webhook: the tenant is resolved FROM the vendor row, then the signature proves the caller
      const vendor = await prisma.vendor.findFirst({
        where: { id: vendorId, tenantId: { not: "" } },
        select: { id: true, tenantId: true, integrationSettings: true },
      });
      const settings = readPlatformSettings(vendor?.integrationSettings, platform);
      if (!vendor || !settings.webhookSecret) {
        res.status(401).json({ error: `Unknown or unconfigured ${platform} webhook endpoint` });
        return;
      }

      const raw = rawBodyOf(req);
      if (!raw || raw.length === 0) {
        res.status(400).json({ error: "Empty request body" });
        return;
      }
      if (!verify(req, raw, settings.webhookSecret)) {
        res.status(401).json({ error: "Invalid webhook signature" });
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(raw.toString("utf8"));
      } catch {
        res.status(400).json({ error: "Body is not valid JSON" });
        return;
      }

      const gateError = gate(req, body);
      if (gateError) {
        res.status(422).json({ error: gateError });
        return;
      }

      const mapped = map(body);
      if (!mapped.ok) {
        // ts-jest compiles with strict:false, where the discriminant does not narrow.
        res.status(422).json({ error: (mapped as Extract<MapResult, { ok: false }>).error });
        return;
      }
      const order = mapped.order;
      const { tenantId } = vendor;

      if (!settings.branchId) {
        res.status(422).json({
          error: `No branch set for ${platform} orders. Choose one on the shop's Integrations tab in Darb.`,
        });
        return;
      }

      // Idempotency pre-check, as /api/partner: a replay (or orders/paid after
      // orders/create for the same order) returns what we already have.
      const existing = await prisma.deliveryOrder.findFirst({
        where: { tenantId, vendorId: vendor.id, externalRef: order.externalRef },
      });
      if (existing) {
        res.status(200).json(orderView(existing));
        return;
      }

      const branch = await prisma.vendorBranch.findFirst({
        where: { id: settings.branchId, tenantId, vendorId: vendor.id },
        select: { id: true },
      });
      if (!branch) {
        res.status(422).json({ error: `The ${platform} branch configured in Darb no longer belongs to this shop` });
        return;
      }

      try {
        const created = await createDeliveryOrder({
          tenantId,
          source: "PARTNER_API",
          vendorId: vendor.id,
          branchId: branch.id,
          paymentMethod: order.paymentMethod,
          orderTotalKwd: order.orderTotalKwd,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          dropoffAddress: order.dropoffAddress,
          // Missing coordinates go through as they do for an address-only
          // partner order: createDeliveryOrder rejects with NO_COORDINATES
          // into Needs review, where ops add the pin.
          dropoff: { lat: order.lat, lng: order.lng },
          externalRef: order.externalRef,
          metadata: order.metadata,
          actor: { type: "VENDOR", id: vendor.id, name: `${platform}-webhook` },
        });
        res.status(201).json(orderView(created));
      } catch (err) {
        // externalRef unique race: the platform retried while the first
        // delivery was still inserting. Return the row the winner made.
        const raced = await prisma.deliveryOrder.findFirst({
          where: { tenantId, vendorId: vendor.id, externalRef: order.externalRef },
        });
        if (raced) {
          res.status(200).json(orderView(raced));
          return;
        }
        throw err;
      }
    } catch (err) {
      logger.error({ err, platform, vendorId }, "store webhook order create failed");
      res.status(500).json({ error: "Order creation failed" });
    }
  };
}

/**
 * @swagger
 * /api/integrations/shopify/{vendorId}/orders:
 *   post:
 *     tags: [Store integrations]
 *     summary: Shopify orders/create or orders/paid webhook (X-Shopify-Hmac-Sha256)
 */
router.post(
  "/shopify/:vendorId/orders",
  intakeHandler(
    "shopify",
    (req, raw, secret) => verifyShopifySignature(raw, req.get("x-shopify-hmac-sha256"), secret),
    (req) => {
      // The topic header is absent on a hand-fired test; the payload check
      // still decides then.
      const topic = (req.get("x-shopify-topic") ?? "").trim();
      if (topic && !(SHOPIFY_ORDER_TOPICS as readonly string[]).includes(topic)) {
        return `Unsupported Shopify topic "${topic}"; subscribe this URL to orders/create or orders/paid only`;
      }
      return null;
    },
    mapShopifyOrder,
  ),
);

/**
 * @swagger
 * /api/integrations/salla/{vendorId}/orders:
 *   post:
 *     tags: [Store integrations]
 *     summary: Salla order.created webhook (X-Salla-Signature, or the Token strategy)
 */
router.post(
  "/salla/:vendorId/orders",
  intakeHandler(
    "salla",
    (req, raw, secret) =>
      verifySallaSignature(
        raw,
        {
          strategy: req.get("x-salla-security-strategy"),
          signature: req.get("x-salla-signature"),
          authorization: req.get("authorization"),
        },
        secret,
      ),
    () => null, // the event name is in the body; mapSallaOrder checks it
    mapSallaOrder,
  ),
);

export default router;
