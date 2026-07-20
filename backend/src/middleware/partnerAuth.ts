/**
 * Darb 2.0 PRD §2 — partner order-intake authentication.
 *
 * Merchants push ready orders with an API key ("X-Api-Key" header, or
 * "Authorization: Bearer <key>"). Only sha256(key) is stored (ApiKey.keyHash,
 * unique), so auth is a single indexed lookup — no constant-time compare
 * needed because the attacker never gets a hash oracle. A key is always
 * scoped to exactly one vendor of one tenant; the request is stamped with
 * that scope and the route layer never trusts client-provided ids.
 */
import { createHash } from "crypto";
import { NextFunction, Request, Response } from "express";
import { prisma } from "../config";
import { logger } from "../config/logger";

export interface PartnerContext {
  apiKeyId: string;
  tenantId: string;
  vendorId: string;
}

declare module "express-serve-static-core" {
  interface Request {
    partner?: PartnerContext;
  }
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

function extractKey(req: Request): string | null {
  const headerKey = req.get("x-api-key");
  if (headerKey && headerKey.trim()) return headerKey.trim();
  const auth = req.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  return null;
}

export async function partnerAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawKey = extractKey(req);
  if (!rawKey) {
    res.status(401).json({ error: "API key required (X-Api-Key header)" });
    return;
  }

  try {
    // eslint-disable-next-line no-restricted-syntax -- key lookup happens before any tenant context exists
    const key = await prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(rawKey) },
    });
    if (!key || !key.isActive) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    req.partner = {
      apiKeyId: key.id,
      tenantId: key.tenantId,
      vendorId: key.vendorId,
    };

    // Best-effort usage stamp — never blocks the request.
    void prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    next();
  } catch (err) {
    logger.error({ err }, "partnerAuth: lookup failed");
    res.status(500).json({ error: "Authentication failed" });
  }
}
