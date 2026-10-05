/**
 * Store platform order intake: Shopify and Salla.
 *
 * Client note, 2026-08-16: "for the integrations we should have more than
 * Foodics, such as uPayments, Salla, Shopify, and others, and sometimes it is a
 * custom system." Foodics has its own connector; this file is the other two
 * store platforms that actually produce orders. uPayments is a payment gateway,
 * not an order source, and a custom system uses the partner API (/api/partner)
 * with an API key, so neither has a mapper here.
 *
 * Pure functions only (signature checks and payload mapping), so the route
 * stays thin and the rules can be tested without a request in flight. The
 * result of a mapper is the same shape the partner intake hands to
 * createDeliveryOrder; anything we cannot map comes back as an error string
 * and the route answers 4xx without creating anything.
 *
 * Per-shop config lives on Vendor.integrationSettings (no schema change):
 *   integrationSettings.shopify = { webhookSecret, branchId }
 *   integrationSettings.salla   = { webhookSecret, branchId }
 */
import crypto from "crypto";

export type StorePlatform = "shopify" | "salla";

export interface StorePlatformSettings {
  webhookSecret: string;
  branchId: string;
}

export interface MappedStoreOrder {
  /** Namespaced with the platform, so a shop's Shopify order 1001 and its
   *  partner-API order 1001 cannot collide on the externalRef unique. */
  externalRef: string;
  paymentMethod: "COD" | "PREPAID";
  orderTotalKwd: string;
  customerName?: string;
  customerPhone?: string;
  dropoffAddress?: string;
  lat?: number;
  lng?: number;
  metadata: Record<string, unknown>;
}

export type MapResult = { ok: true; order: MappedStoreOrder } | { ok: false; error: string };

// ─── Settings ────────────────────────────────────────────────────────────────

/**
 * Read one platform's block out of the vendor's integrationSettings blob.
 * Returns what is there even when incomplete, so the route can say which part
 * is missing; `webhookSecret`/`branchId` are "" when unset.
 */
export function readPlatformSettings(
  integrationSettings: unknown,
  platform: StorePlatform,
): StorePlatformSettings {
  const all = (integrationSettings && typeof integrationSettings === "object"
    ? integrationSettings
    : {}) as Record<string, unknown>;
  const block = (all[platform] && typeof all[platform] === "object" ? all[platform] : {}) as Record<
    string,
    unknown
  >;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return { webhookSecret: str(block.webhookSecret), branchId: str(block.branchId) };
}

// ─── Signatures ──────────────────────────────────────────────────────────────

/** Constant-time compare of two strings; a length mismatch is just false. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Shopify: X-Shopify-Hmac-Sha256 is the base64 HMAC-SHA256 of the raw request
 * body, keyed with the webhook signing secret shown in the store admin.
 */
export function verifyShopifySignature(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  return safeEqual(header.trim(), expected);
}

/**
 * Salla has two documented security strategies, named in the
 * X-Salla-Security-Strategy header:
 *   Signature (the default) - X-Salla-Signature is the hex HMAC-SHA256 of the
 *                             raw body, keyed with the app's webhook secret.
 *   Token                   - Authorization: Bearer <token>, the token set in
 *                             the Salla app's webhook settings.
 * The same stored secret serves either, since a shop runs one strategy.
 */
export function verifySallaSignature(
  rawBody: Buffer,
  headers: { strategy?: string; signature?: string; authorization?: string },
  secret: string,
): boolean {
  if (!secret) return false;
  const strategy = (headers.strategy ?? "").trim().toLowerCase();
  if (strategy === "token") {
    const auth = (headers.authorization ?? "").trim();
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : auth;
    return safeEqual(token, secret);
  }
  const signature = (headers.signature ?? "").trim().toLowerCase();
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(signature, expected);
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function text(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function joinParts(parts: unknown[]): string | undefined {
  const joined = parts.map(text).filter((p): p is string => !!p).join(", ");
  return joined ? joined.slice(0, 500) : undefined;
}

function coord(v: unknown, limit: number): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : undefined;
}

/**
 * Both coordinates or neither. A latitude with no longitude is not a pin, and
 * the order then lands exactly like an address-only partner order: rejected
 * with NO_COORDINATES into Needs review, where ops drop the pin.
 */
function pin(lat: unknown, lng: unknown): { lat?: number; lng?: number } {
  const la = coord(lat, 90);
  const ln = coord(lng, 180);
  // 0,0 is the default an unset map widget sends, not a Kuwait address.
  if (la === undefined || ln === undefined || (la === 0 && ln === 0)) return {};
  return { lat: la, lng: ln };
}

/** A KWD amount, normalised to 3 decimals. Undefined when it is not one. */
function kwdAmount(v: unknown): string | undefined {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!/^\d{1,7}(\.\d+)?$/.test(s)) return undefined;
  return Number(s).toFixed(3);
}

/**
 * Darb prices and settles in KWD. An order in another currency would put a
 * foreign figure in the COD amount the driver collects, so it is refused
 * rather than guessed at. A missing currency is read as the shop's own (KWD).
 */
function currencyError(currency: unknown): string | null {
  const c = text(currency);
  if (c && c.toUpperCase() !== "KWD") {
    return `Order currency is ${c}; Darb only takes KWD orders`;
  }
  return null;
}

// ─── Shopify ─────────────────────────────────────────────────────────────────

export const SHOPIFY_ORDER_TOPICS = ["orders/create", "orders/paid"] as const;

/**
 * Cash on delivery in Shopify shows up as the gateway name ("Cash on Delivery
 * (COD)") or as an order still financially pending at checkout. Everything
 * else was paid online and the driver collects nothing.
 */
function shopifyIsCod(order: Record<string, unknown>): boolean {
  const gateways = [
    order.gateway,
    ...(Array.isArray(order.payment_gateway_names) ? order.payment_gateway_names : []),
  ]
    .map((g) => (typeof g === "string" ? g.toLowerCase() : ""))
    .filter(Boolean);
  if (gateways.some((g) => g.includes("cash on delivery") || /\bcod\b/.test(g))) return true;
  return String(order.financial_status ?? "").toLowerCase() === "pending";
}

export function mapShopifyOrder(body: unknown): MapResult {
  const order = asRecord(body);
  const id = text(order.id);
  if (!id || !/^\d+$/.test(id)) return { ok: false, error: "Not a Shopify order payload: missing numeric id" };

  const curErr = currencyError(order.currency ?? order.presentment_currency);
  if (curErr) return { ok: false, error: curErr };

  const total = kwdAmount(order.total_price);
  if (total === undefined) return { ok: false, error: "Shopify order has no valid total_price" };

  const ship = asRecord(order.shipping_address);
  if (Object.keys(ship).length === 0) {
    return { ok: false, error: "Shopify order has no shipping_address (pickup or digital order), nothing to deliver" };
  }
  const customer = asRecord(order.customer);
  const billing = asRecord(order.billing_address);

  const name =
    text(ship.name) ??
    joinParts([ship.first_name, ship.last_name])?.replace(/, /g, " ") ??
    joinParts([customer.first_name, customer.last_name])?.replace(/, /g, " ");
  const phone = text(ship.phone) ?? text(order.phone) ?? text(customer.phone) ?? text(billing.phone);
  const address = joinParts([ship.address1, ship.address2, ship.city, ship.province, ship.zip]);
  if (!address) return { ok: false, error: "Shopify shipping_address has no address lines" };

  const { lat, lng } = pin(ship.latitude, ship.longitude);

  return {
    ok: true,
    order: {
      externalRef: `shopify:${id}`,
      paymentMethod: shopifyIsCod(order) ? "COD" : "PREPAID",
      orderTotalKwd: total,
      customerName: name?.slice(0, 200),
      customerPhone: phone?.slice(0, 30),
      dropoffAddress: address,
      lat,
      lng,
      metadata: {
        platform: "shopify",
        platformOrderId: id,
        platformOrderName: text(order.name) ?? null,
        financialStatus: text(order.financial_status) ?? null,
      },
    },
  };
}

// ─── Salla ───────────────────────────────────────────────────────────────────

export const SALLA_ORDER_EVENTS = ["order.created"] as const;

/** "+965" and "50000000" become "+96550000000"; a full number is left alone. */
function sallaPhone(code: unknown, mobile: unknown): string | undefined {
  const m = text(mobile);
  if (!m) return undefined;
  if (m.startsWith("+")) return m;
  const c = text(code);
  if (!c) return m;
  return `${c.startsWith("+") ? c : `+${c}`}${m}`;
}

export function mapSallaOrder(body: unknown): MapResult {
  const envelope = asRecord(body);
  const event = text(envelope.event);
  if (!event || !(SALLA_ORDER_EVENTS as readonly string[]).includes(event)) {
    return { ok: false, error: `Unsupported Salla event "${event ?? "none"}"; subscribe this URL to order.created only` };
  }
  const data = asRecord(envelope.data);
  const id = text(data.id);
  if (!id) return { ok: false, error: "Not a Salla order payload: missing data.id" };

  const amounts = asRecord(data.amounts);
  const totalBlock = asRecord(amounts.total);
  const curErr = currencyError(totalBlock.currency ?? data.currency);
  if (curErr) return { ok: false, error: curErr };
  const total = kwdAmount(totalBlock.amount);
  if (total === undefined) return { ok: false, error: "Salla order has no valid amounts.total.amount" };

  const shipping = asRecord(data.shipping);
  const addr = asRecord(shipping.address);
  if (Object.keys(addr).length === 0) {
    return { ok: false, error: "Salla order has no shipping.address (pickup or digital order), nothing to deliver" };
  }
  const receiver = asRecord(shipping.receiver);
  const customer = asRecord(data.customer);

  const name =
    text(receiver.name) ??
    joinParts([customer.first_name, customer.last_name])?.replace(/, /g, " ") ??
    text(customer.name);
  const phone =
    text(receiver.phone) ?? sallaPhone(customer.mobile_code, customer.mobile) ?? text(customer.phone);
  const address =
    joinParts([addr.shipping_address, addr.street_number, addr.city]) ??
    joinParts([addr.country, addr.postal_code]);
  if (!address) return { ok: false, error: "Salla shipping.address has no address text" };

  const geo = asRecord(addr.geo_coordinates);
  const { lat, lng } = pin(geo.lat, geo.lng);

  const method = String(data.payment_method ?? "").toLowerCase();

  return {
    ok: true,
    order: {
      externalRef: `salla:${id}`,
      paymentMethod: method === "cod" ? "COD" : "PREPAID",
      orderTotalKwd: total,
      customerName: name?.slice(0, 200),
      customerPhone: phone?.slice(0, 30),
      dropoffAddress: address,
      lat,
      lng,
      metadata: {
        platform: "salla",
        platformOrderId: id,
        platformReference: text(data.reference_id) ?? null,
        paymentMethodRaw: method || null,
      },
    },
  };
}
