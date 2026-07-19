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

export default router;
