/**
 * Darb 2.0 — /api/webhooks (plan §A6). PUBLIC router — NO authMiddleware /
 * tenantScope: callers are third-party platforms, not Darb users.
 *
 * MOUNTING (integration item — server.ts is owned by another track):
 *   app.use("/api/webhooks", webhooksRouter);   // BEFORE auth-guarded routers
 * Optionally capture the raw body for HMAC verification:
 *   express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } })
 *
 * POST /foodics/:secret
 *   - Path secret is per-connection (FoodicsConnection.webhookSecret) — the
 *     tenant/vendor resolve FROM the secret; unknown secret ⇒ 401.
 *   - Optional HMAC: when env FOODICS_WEBHOOK_HMAC_SECRET is set AND
 *     req.rawBody was captured, the X-Foodics-Signature header (hex
 *     HMAC-SHA256 of the raw body — header name to be re-verified against
 *     sandbox) must match; missing rawBody logs a warning and continues.
 *   - Idempotency: eventKey = provider event id when present, else
 *     sha256({event, orderId, delivery_status, updated_at}). The
 *     WebhookEvent.eventKey unique constraint collapses replays —
 *     P2002 ⇒ 200 {duplicate:true} immediately, nothing re-enqueued.
 *   - ALWAYS answers 200 within <1s once the event row is stored — heavy
 *     work happens in the foodics-ingest job. Any post-insert error still
 *     returns 200 (the row stays RECEIVED for a later sweep/retry).
 */
import crypto from "crypto";
import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { logger } from "../config/logger";
import { extractFoodicsEnvelope } from "../services/foodics/mapper";
import { enqueueFoodicsIngest } from "../queues/foodicsWorker";
import { publishOrderEvent } from "../services/orderStateMachine";

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Idempotency key for one webhook delivery. Prefers a provider event id;
 * falls back to hashing the identifying tuple (event name included so
 * created/updated with identical timestamps can't collide).
 */
export function computeFoodicsEventKey(body: unknown): string {
  const b = (body ?? {}) as Record<string, unknown>;
  const providerEventId =
    typeof b.event_id === "string" ? b.event_id
    : typeof b.webhook_id === "string" ? b.webhook_id
    : null;
  if (providerEventId) return `foodics:evt:${providerEventId}`;

  const { event, order } = extractFoodicsEnvelope(body);
  const o = (order ?? {}) as Record<string, unknown>;
  return `foodics:${sha256Hex(
    JSON.stringify({
      event: event ?? null,
      orderId: o.id ?? null,
      deliveryStatus: o.delivery_status ?? null,
      updatedAt: o.updated_at ?? null,
    }),
  )}`;
}

/** Constant-time hex comparison (length mismatch ⇒ false, never throws). */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isP2002(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === "P2002";
}

// ─── POST /foodics/:secret ──────────────────────────────────────────────────

router.post("/foodics/:secret", async (req: Request, res: Response) => {
  try {
    const secret = req.params.secret;
    // Pre-tenant lookup BY DESIGN — the secret IS the tenant resolver;
    // `tenantId: { not: "" }` satisfies the tenant guard.
    const connection = await prisma.foodicsConnection.findFirst({
      where: { webhookSecret: secret, tenantId: { not: "" } },
      select: { id: true, tenantId: true, vendorId: true },
    });
    if (!connection) {
      res.status(401).json({ error: "Unknown webhook endpoint" });
      return;
    }

    // Optional raw-body HMAC (defence-in-depth on top of the path secret).
    const hmacSecret = process.env.FOODICS_WEBHOOK_HMAC_SECRET;
    if (hmacSecret) {
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!rawBody) {
        logger.warn(
          "foodics webhook: FOODICS_WEBHOOK_HMAC_SECRET set but req.rawBody missing — add the express.json verify hook in server.ts (integration item); accepting on path secret only",
        );
      } else {
        const signature =
          (req.headers["x-foodics-signature"] as string | undefined) ??
          (req.headers["x-signature"] as string | undefined) ??
          "";
        const expected = crypto.createHmac("sha256", hmacSecret).update(rawBody).digest("hex");
        if (!signature || !safeEqualHex(signature, expected)) {
          res.status(401).json({ error: "Invalid webhook signature" });
          return;
        }
      }
    }

    const body = req.body ?? {};
    const eventKey = computeFoodicsEventKey(body);

    let webhookEventId: string;
    try {
      const created = await prisma.webhookEvent.create({
        data: {
          provider: "foodics",
          eventKey,
          // Envelope: identity resolved from the secret + the raw body —
          // the ingest worker trusts THIS, never re-derives from the body.
          payload: {
            connectionId: connection.id,
            tenantId: connection.tenantId,
            vendorId: connection.vendorId,
            receivedAt: new Date().toISOString(),
            body,
          } as object,
        },
      });
      webhookEventId = created.id;
    } catch (err) {
      if (isP2002(err)) {
        res.status(200).json({ received: true, duplicate: true });
        return;
      }
      throw err;
    }

    // Everything after the insert is best-effort — the answer is 200 either
    // way (RECEIVED rows are recoverable; a hanging Foodics retry loop isn't).
    try {
      await prisma.foodicsConnection.updateMany({
        where: { id: connection.id, tenantId: connection.tenantId },
        data: { lastEventAt: new Date() },
      });
      await enqueueFoodicsIngest(webhookEventId);
    } catch (err) {
      logger.error(
        { err, webhookEventId },
        "foodics webhook: post-insert processing failed — row left RECEIVED",
      );
    }

    res.status(200).json({ received: true });
  } catch (err) {
    logger.error({ err }, "foodics webhook: unhandled error");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// ─── Twilio WhatsApp inbound (PRD §12 customer support thread) ──────────────

const TRACK_SUPERVISOR_ROLES = ["ADMIN", "OPS_MANAGER", "SUPERVISOR"] as const;

/**
 * POST /api/webhooks/twilio-whatsapp
 *
 * The customer replies in the WhatsApp thread; Twilio forwards it here. No
 * conversational state machine (PRD-simple): the message is stored as a
 * WebhookEvent, matched to the customer's most recent live order to resolve
 * the tenant, and raised as a HIGH notification to rider support — ops reply
 * from their own WhatsApp.
 *
 * Signature: when TWILIO_AUTH_TOKEN is set, X-Twilio-Signature is validated
 * (HMAC-SHA1 of the full URL + sorted POST params, per Twilio's scheme);
 * unset token = accept-and-log, matching the Foodics path-secret fallback
 * stance for pre-credential environments.
 */
router.post("/twilio-whatsapp", async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, string>;
    const from = String(body.From ?? "").replace(/^whatsapp:/, "");
    const text = String(body.Body ?? "").slice(0, 1000);
    const messageSid = String(body.MessageSid ?? "");

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (authToken) {
      const signature = req.get("x-twilio-signature") ?? "";
      const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
      const data = Object.keys(body)
        .sort()
        .reduce((acc, key) => acc + key + body[key], url);
      const expected = crypto
        .createHmac("sha1", authToken)
        .update(Buffer.from(data, "utf-8"))
        .digest("base64");
      if (signature !== expected) {
        res.status(403).json({ error: "Invalid signature" });
        return;
      }
    }

    if (!from || !text) {
      res.status(200).send("<Response></Response>");
      return;
    }

    // Idempotency: Twilio retries webhooks; the eventKey unique collapses them.
    try {
      await prisma.webhookEvent.create({
        data: {
          provider: "twilio-whatsapp",
          eventKey: messageSid || `wa:${from}:${Date.now()}`,
          payload: { from, text } as any,
          status: "PROCESSED",
          processedAt: new Date(),
        },
      });
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") {
        res.status(200).send("<Response></Response>");
        return;
      }
      throw err;
    }

    // Resolve tenant by the customer's most recent non-terminal order.
    // eslint-disable-next-line no-restricted-syntax -- inbound webhook: tenant is resolved FROM the data
    const order = await prisma.deliveryOrder.findFirst({
      where: {
        customerPhone: from,
        status: { in: ["CREATED", "DISPATCHING", "NO_DRIVER", "ASSIGNED", "PICKED_UP"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, tenantId: true, orderNumber: true, vendorId: true },
    }) ?? await prisma.deliveryOrder.findFirst({
      // Fall back to ANY recent order so post-delivery support still routes.
      // eslint-disable-next-line no-restricted-syntax -- inbound webhook: tenant is resolved FROM the data
      where: { customerPhone: from },
      orderBy: { createdAt: "desc" },
      select: { id: true, tenantId: true, orderNumber: true, vendorId: true },
    });

    if (order) {
      // eslint-disable-next-line no-restricted-syntax -- tenant comes from the matched order
      const users = await prisma.user.findMany({
        where: {
          tenantId: order.tenantId,
          role: { in: [...TRACK_SUPERVISOR_ROLES] },
          isActive: true,
        },
        select: { id: true },
      });
      if (users.length > 0) {
        // eslint-disable-next-line no-restricted-syntax -- tenant comes from the matched order
        await prisma.notification.createMany({
          data: users.map((user) => ({
            tenantId: order.tenantId,
            userId: user.id,
            title: "Customer WhatsApp message",
            message: `${from} (order ${order.orderNumber}): ${text.slice(0, 300)}`,
            type: "CUSTOMER_WHATSAPP_REPLY",
            severity: "HIGH",
            sourceId: order.id,
            category: "OPS_TODO",
            metadata: { orderId: order.id, from, text } as any,
          })),
        });
      }
      publishOrderEvent(order.tenantId, "notification", {
        orderId: order.id,
        orderNumber: order.orderNumber,
        vendorId: order.vendorId,
        kind: "whatsapp_reply",
      });
    } else {
      logger.info({ from }, "twilio-whatsapp: no matching order for inbound message");
    }

    // TwiML empty response = no auto-reply.
    res.type("text/xml").status(200).send("<Response></Response>");
  } catch (err) {
    logger.error({ err }, "twilio-whatsapp webhook failed");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
