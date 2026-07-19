/**
 * Foodics webhook payload → CreateOrderInput mapper (plan §A6). PURE — no
 * prisma, no fetch, no env; fixture-tested. Everything the ingest worker
 * needs to interpret a webhook body lives here so the interpretation rules
 * are unit-testable against fixtures and re-verifiable against sandbox.
 *
 * Payload assumptions (documented fields: order id, source, status,
 * delivery_status, customer address, total_price, branch, payments, app_id)
 * are ISOLATED here + in __tests__/fixtures/foodics/ — when sandbox
 * credentials arrive, re-record the fixtures and fix only this file.
 */
import { CreateOrderInput } from "../orderService";

// ─── Webhook envelope ──────────────────────────────────────────────────────

export interface FoodicsWebhookEnvelope {
  /** e.g. "order.delivery.created" | "order.delivery.updated" (null = unknown). */
  event: string | null;
  /** The order object carried by the webhook. */
  order: Record<string, unknown> | null;
}

/**
 * Foodics webhook bodies observed in docs wrap the order under `payload`
 * (sometimes `data`/`order`); some deliveries post the order at the top
 * level. Tolerate all four. Event name from `event`/`type`.
 */
export function extractFoodicsEnvelope(body: unknown): FoodicsWebhookEnvelope {
  if (!body || typeof body !== "object") return { event: null, order: null };
  const b = body as Record<string, unknown>;
  const event =
    (typeof b.event === "string" && b.event) ||
    (typeof b.type === "string" && b.type) ||
    null;
  const candidate = [b.payload, b.data, b.order].find(
    (v) => v && typeof v === "object" && !Array.isArray(v),
  ) as Record<string, unknown> | undefined;
  if (candidate) return { event, order: candidate };
  // Top-level order shape: must at least carry an id to count.
  if (typeof b.id === "string" || typeof b.id === "number") {
    return { event, order: b };
  }
  return { event, order: null };
}

// ─── Small tolerant readers ────────────────────────────────────────────────

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// ─── Tag eligibility ───────────────────────────────────────────────────────

/**
 * Does the order carry the given tag? Foodics tags arrive as an array of
 * {id, name} objects (tolerate bare-id arrays too). Used by the ingest
 * worker's eligibility filter when connection.orderTagId is set.
 */
export function orderHasTag(order: Record<string, unknown>, tagId: string): boolean {
  const tags = order.tags;
  if (!Array.isArray(tags)) return false;
  return tags.some((t) => {
    if (typeof t === "string") return t === tagId;
    const o = obj(t);
    return !!o && str(o.id) === tagId;
  });
}

// ─── POS-side cancellation detection ───────────────────────────────────────

/**
 * Foodics numeric order/delivery status codes indicating the order is no
 * longer active on the POS side. RE-VERIFY AGAINST SANDBOX before go-live —
 * documented mapping assumed here: order status 4=void 5=returned;
 * delivery_status 6=cancelled (see statusWriteback.ts table).
 */
const INACTIVE_ORDER_STATUSES = new Set([4, 5]);
const CANCELLED_DELIVERY_STATUS = 6;

export function isFoodicsOrderInactive(order: Record<string, unknown>): boolean {
  const status = num(order.status);
  if (status !== null && INACTIVE_ORDER_STATUSES.has(status)) return true;
  const deliveryStatus = num(order.delivery_status);
  if (deliveryStatus === CANCELLED_DELIVERY_STATUS) return true;
  if (order.is_deleted === true) return true;
  return false;
}

// ─── Order mapper ──────────────────────────────────────────────────────────

export interface FoodicsMapContext {
  tenantId: string;
  vendorId: string;
  /** foodicsBranchId → our VendorBranch (built from VendorBranch rows). */
  branchByFoodicsId: Map<string, { id: string }>;
}

export type FoodicsMapResult = CreateOrderInput | { skip: string };

export function isSkip(result: FoodicsMapResult): result is { skip: string } {
  return typeof (result as { skip?: unknown }).skip === "string";
}

/**
 * Map one Foodics order payload → CreateOrderInput.
 *
 *   - order id            → foodicsOrderId (missing ⇒ skip)
 *   - branch.id           → branchId via ctx map (unmapped ⇒ skip — the
 *                           portal must map the branch first)
 *   - customer name/phone → customer fields (dial_code + phone joined)
 *   - customer_address    → dropoff lat/lng + formatted address; MISSING
 *                           COORDS STILL MAP — orderService persists a
 *                           REJECTED (NO_COORDINATES) row, which we want
 *   - total_price         → orderTotalKwd
 *   - payments[] present  → PREPAID, else COD (absent payments = cash)
 *   - customer_notes      → metadata.foodics.customerNotes
 */
export function mapFoodicsOrder(
  payload: Record<string, unknown>,
  ctx: FoodicsMapContext,
): FoodicsMapResult {
  const foodicsOrderId = str(payload.id);
  if (!foodicsOrderId) return { skip: "MISSING_ORDER_ID" };

  const branch = obj(payload.branch);
  const foodicsBranchId = branch ? str(branch.id) : null;
  if (!foodicsBranchId) return { skip: "MISSING_BRANCH" };
  const mappedBranch = ctx.branchByFoodicsId.get(foodicsBranchId);
  if (!mappedBranch) return { skip: `UNKNOWN_BRANCH:${foodicsBranchId}` };

  const totalPrice = num(payload.total_price);
  if (totalPrice === null || totalPrice < 0) return { skip: "MISSING_TOTAL_PRICE" };

  // Customer
  const customer = obj(payload.customer);
  const customerName = customer ? str(customer.name) : null;
  const dialCode = customer ? str(customer.dial_code) : null;
  const rawPhone = customer ? str(customer.phone) : null;
  const customerPhone = rawPhone
    ? dialCode && !rawPhone.startsWith("+")
      ? `+${dialCode.replace(/^\+/, "")}${rawPhone}`
      : rawPhone
    : null;

  // Dropoff — customer_address carries coords + human-readable parts.
  const address = obj(payload.customer_address);
  const lat = address ? num(address.latitude) : null;
  const lng = address ? num(address.longitude) : null;
  const addressParts = address
    ? [str(address.name), str(address.description)].filter((p): p is string => !!p)
    : [];
  const dropoffAddress = addressParts.length > 0 ? addressParts.join(" — ") : null;

  // Payments: a present, non-empty payments array means the order was paid
  // online/at-till ⇒ PREPAID. Missing/empty ⇒ cash on delivery.
  const payments = payload.payments;
  const paymentMethod: "COD" | "PREPAID" =
    Array.isArray(payments) && payments.length > 0 ? "PREPAID" : "COD";

  return {
    tenantId: ctx.tenantId,
    source: "FOODICS",
    vendorId: ctx.vendorId,
    branchId: mappedBranch.id,
    paymentMethod,
    orderTotalKwd: totalPrice,
    customerName: customerName ?? undefined,
    customerPhone: customerPhone ?? undefined,
    dropoffAddress: dropoffAddress ?? undefined,
    dropoff: {
      ...(lat !== null ? { lat } : {}),
      ...(lng !== null ? { lng } : {}),
    },
    foodicsOrderId,
    metadata: {
      foodics: {
        reference: str(payload.reference),
        number: str(payload.number),
        status: num(payload.status),
        deliveryStatus: num(payload.delivery_status),
        source: num(payload.source) ?? str(payload.source),
        appId: str(payload.app_id),
        customerNotes: str(payload.customer_notes),
      },
    },
    actor: { type: "SYSTEM", name: "foodics-webhook" },
  };
}
