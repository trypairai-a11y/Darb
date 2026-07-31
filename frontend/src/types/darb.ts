// Darb 2.0 — shared frontend types for the delivery-infrastructure product
// (Slice B). Mirrors the Slice A Prisma models / API contracts (plan §A1–§A8).
// Money is KWD with 3 decimal places; the API serializes Prisma Decimals as
// strings, so money fields are typed `string | number` and formatted with
// formatKwd().

// ── Enums ────────────────────────────────────────────────────────────────

export type DeliveryOrderStatus =
  | "CREATED"
  | "REJECTED"
  | "DISPATCHING"
  | "NO_DRIVER"
  | "ASSIGNED"
  | "ARRIVED"
  | "PICKED_UP"
  | "DELIVERED"
  | "FAILED"
  // PRD §6 return-to-merchant. FAILED→RETURNED is the only exit from FAILED,
  // and the backend FSM has always had it; the frontend union simply never
  // listed it.
  | "RETURNED"
  | "CANCELLED";

export type DeliveryOrderSource = "FOODICS" | "VENDOR_PORTAL" | "SUPERVISOR";

export type PaymentMethod = "COD" | "PREPAID";

export type OfferStatus = "OFFERED" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";

export type WalletOwnerType =
  | "DRIVER_CASH"
  | "VENDOR_PAYABLE"
  | "PLATFORM_REVENUE"
  | "PLATFORM_CLEARING";

export type WalletTxType =
  | "COD_SETTLEMENT"
  | "PREPAID_SETTLEMENT"
  | "REMITTANCE"
  | "ADJUSTMENT"
  | "VENDOR_PAYOUT"
  // Revision 10 (#2) — a merchant paying into their own wallet. Its own type so
  // a shop can tell what it paid in apart from what Darb corrected.
  | "TOP_UP";

export type WalletEntryDirection = "DEBIT" | "CREDIT";

export type IncidentType = "SOS" | "ACCIDENT" | "VEHICLE_BREAKDOWN" | "CUSTOMER_ISSUE" | "OTHER";

export type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export type DriverAvailability = "ONLINE" | "BUSY" | "OFFLINE";

export type OrderRejectionReason =
  | "OUT_OF_ZONE_DROPOFF"
  | "UNSERVICEABLE_PAIR"
  | "NO_COORDINATES"
  | "BRANCH_UNZONED"
  | "VENDOR_PAUSED"
  // Revision 10 (#7) — one branch stopped taking orders, not the whole shop.
  | "BRANCH_PAUSED"
  | "VENDOR_CREDIT_CAP";

export type RemittanceMethod = "CASH" | "BANK_TRANSFER" | "AL_MUZAINI";

export type FoodicsConnStatus = "CONNECTED" | "DISCONNECTED" | "ERROR" | "PENDING";

/** KWD amount — Prisma Decimal serialized as string, sometimes a number. */
export type Kwd = string | number;

// ── Geo ──────────────────────────────────────────────────────────────────

/** GeoJSON polygon — coordinates are rings of [lng, lat] pairs. */
export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

// ── Zones + pricing ──────────────────────────────────────────────────────

export interface DeliveryZone {
  id: string;
  code: string;
  name: string;
  nameAr?: string | null;
  color?: string | null;
  polygon: GeoJsonPolygon;
  bbox?: unknown;
  centroidLat?: number | null;
  centroidLng?: number | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ZoneSurcharge {
  id?: string;
  originZoneId: string;
  destZoneId: string;
  surchargeKwd: Kwd;
}

export interface FulfillmentSettings {
  intraZoneFeeKwd: Kwd;
  driverCashCeilingKwd: Kwd;
  offerWindowSec: number;
  maxOfferRounds: number;
  searchRadiusKm: number;
  gpsStaleAfterSec: number;
}

export interface ZoneQuote {
  pickupZone?: Pick<DeliveryZone, "id" | "code" | "name" | "nameAr"> | null;
  dropoffZone?: Pick<DeliveryZone, "id" | "code" | "name" | "nameAr"> | null;
  feeKwd?: Kwd;
  /** The quote endpoints answer with `ok`, not `serviceable`. */
  ok: boolean;
  reason?: OrderRejectionReason | string;
}

// ── Vendors ──────────────────────────────────────────────────────────────

export interface Vendor {
  id: string;
  name: string;
  nameAr?: string | null;
  code: string;
  phone?: string | null;
  requiresCarOnly: boolean;
  isPaused: boolean;
  isActive: boolean;
  /**
   * Revision 4 (#7) — the named price list this merchant is quoted on. Null
   * falls through to the tenant-wide flat fee plus surcharge grid.
   */
  deliveryPlanId?: string | null;
  deliveryPlan?: {
    id: string;
    name: string;
    type: "ZONE" | "KM";
    isActive: boolean;
  } | null;
  createdAt?: string;
  updatedAt?: string;
  branches?: VendorBranch[];
  /**
   * Revision 10 (#6) — the tabs the CALLING login may open, returned by
   * /api/vendor/me. The rail and the route fence read this instead of deriving
   * access from vendorRole, so a narrowed tab list is visible to the portal
   * rather than only showing up as a 403.
   */
  portalTabs?: VendorTab[] | null;
  /**
   * Revision 11 (#5) — the caller's portal role and pinned branch, as the
   * SERVER sees them, from /api/vendor/me.
   *
   * Both used to be read off the JWT on this side, and a token carries whatever
   * was true the day it was minted. An owner who moved somebody to a
   * branch-only tracking role changed nothing until that person logged out
   * again: the rail kept drawing the tabs of the role they used to have, and
   * clicking one produced the 403 the client reported. These are the answer the
   * route fences enforce, so the screen and the server agree.
   */
  portalRole?: VendorPortalRole | null;
  pinnedBranchId?: string | null;
  /** Flat count returned by the vendors list endpoint. */
  branchCount?: number;
  foodicsConnected?: boolean;
  /**
   * Signed wallet balance as a 3dp string, or null when the vendor has no
   * wallet account yet. Positive means Darb owes the vendor.
   */
  walletBalanceKwd?: string | null;
  _count?: { branches?: number; orders?: number; users?: number };
}

export interface VendorBranch {
  id: string;
  vendorId: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  lat: number | string;
  lng: number | string;
  zoneId?: string | null;
  foodicsBranchId?: string | null;
  zone?: Pick<DeliveryZone, "id" | "code" | "name" | "nameAr"> | null;
  // Revision 10 (#7) — this counter alone has stopped taking orders. The
  // account-wide Vendor.isPaused still pauses every branch on top of this.
  isPaused?: boolean;
  // Revision 5 (#6) — the branch's own price list. Null inherits the vendor's.
  deliveryPlanId?: string | null;
  deliveryPlan?: { id: string; name: string; type: DeliveryPlanType } | null;
  isActive?: boolean;
}

/**
 * Vendor portal sub-role (client revision #9). OWNER is vendor-wide and is
 * what every pre-existing portal user is treated as.
 */
export type VendorPortalRole = "OWNER" | "FINANCE" | "ORDER_TRACKING";

export interface VendorUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: "VENDOR";
  vendorRole?: VendorPortalRole | null;
  /** Set only for ORDER_TRACKING logins — the one branch they may see. */
  branchId?: string | null;
  branch?: { id: string; name: string } | null;
  isActive?: boolean;
  createdAt?: string;
  /**
   * Revision 10 (#6) — the per-user tab override actually saved on this login.
   * Null means "inherit the role's tabs", which is what every pre-existing
   * login does.
   */
  vendorTabs?: VendorTab[] | null;
  /** What this login opens today: the override if set, else the role default. */
  effectiveTabs?: VendorTab[];
}

/** Revision 10 (#6) — the merchant portal's own tabs. */
export type VendorTab = "ORDERS" | "WALLET" | "GROW" | "SUPPORT" | "TEAM" | "SETTINGS";

export type VendorTopUpStatus = "PENDING" | "PAID" | "CANCELLED" | "FAILED";

/**
 * Revision 10 (#2) — one merchant top-up. `paymentUrl` is the gateway's hosted
 * checkout when a gateway is configured, and the Darb-hosted /pay/{token} page
 * otherwise, so it is always a link the shop can open.
 */
export interface VendorTopUp {
  id: string;
  amountKwd: Kwd;
  status: VendorTopUpStatus;
  reference: string;
  paymentUrl?: string | null;
  /** "MYFATOORAH" when a gateway took it, "MANUAL" when the transfer rail did. */
  provider?: string | null;
  token?: string;
  paidAt?: string | null;
  createdAt?: string;
}

/**
 * Revision 10 (#1) — what came back from a bulk order import.
 *
 * The 422 shape is the same object with `created: 0`: every row that needs
 * fixing is in `rows`, and nothing was created, because a half-finished import
 * is the one outcome a merchant cannot reconcile.
 */
export interface OrderImportResult {
  created: number;
  accepted?: number;
  total?: number;
  error?: string;
  rows: Array<{
    row: number;
    ok: boolean;
    orderId?: string;
    orderNumber?: string;
    status?: string;
    error?: string;
  }>;
}

// ── Delivery orders ──────────────────────────────────────────────────────

export interface DeliveryOrder {
  id: string;
  orderNumber: string;
  /**
   * The customer's tracking link, exactly as it was sent to them. Present on
   * the detail endpoints only, and null until PUBLIC_TRACKING_BASE_URL is set.
   */
  trackingUrl?: string | null;
  /** Revision 8 (#3): when the courier reached the shop. */
  arrivedAt?: string | null;
  source: DeliveryOrderSource;
  foodicsOrderId?: string | null;
  vendorId: string;
  branchId?: string | null;
  status: DeliveryOrderStatus;
  paymentMethod: PaymentMethod;
  orderTotalKwd: Kwd;
  deliveryFeeKwd: Kwd;
  customerName?: string | null;
  customerPhone?: string | null;
  dropoffAddress?: string | null;
  dropoffLat?: number | string | null;
  dropoffLng?: number | string | null;
  pickupZoneId?: string | null;
  dropoffZoneId?: string | null;
  driverId?: string | null;
  offerRound?: number;
  requiresCarOnly?: boolean;
  rejectionReason?: OrderRejectionReason | null;
  cancelReason?: string | null;
  failureReason?: string | null;
  podPin?: string | null;
  proofPhotoUrl?: string | null;
  codCollectedKwd?: Kwd | null;
  slaDeadline?: string | null;
  createdAt: string;
  updatedAt?: string;
  assignedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  metadata?: Record<string, unknown> | null;
  // Common relations (present when the API includes them)
  vendor?: Pick<Vendor, "id" | "name" | "nameAr" | "code"> | null;
  branch?: Pick<VendorBranch, "id" | "name" | "lat" | "lng"> | null;
  driver?: { id: string; name: string; phone?: string | null } | null;
  pickupZone?: Pick<DeliveryZone, "id" | "code" | "name" | "nameAr"> | null;
  dropoffZone?: Pick<DeliveryZone, "id" | "code" | "name" | "nameAr"> | null;
  offers?: DispatchOffer[];
  /**
   * The assigned driver's last GPS fix (revision 11, #6). Only /api/vendor/orders/:id
   * sends these, and only while the order is ASSIGNED or PICKED_UP — a finished
   * order's last known point is somewhere the driver has already left.
   */
  driverPosition?: { lat: number; lng: number } | null;
  driverPositionAt?: string | null;
  etaMin?: number | null;
}

/** One row of the order timeline (OrderEvent). */
export interface DeliveryOrderEvent {
  id: string;
  orderId?: string;
  action: string;
  description?: string | null;
  operator?: string | null;
  operatorId?: string | null;
  timestamp: string;
  metadata?: Record<string, unknown> | null;
}

export interface DispatchOffer {
  id: string;
  orderId: string;
  driverId: string;
  round: number;
  distanceKm?: number | string | null;
  status: OfferStatus;
  offeredAt: string;
  expiresAt: string;
  respondedAt?: string | null;
  driver?: { id: string; name: string; phone?: string | null } | null;
}

/** Candidate driver for manual (re)assignment. */
export interface DispatchCandidate {
  driverId: string;
  name: string;
  phone?: string | null;
  distanceKm?: number | null;
  availability?: DriverAvailability;
  vehicleType?: string | null;
  cashOnHandKwd?: Kwd;
}

// ── Wallets ──────────────────────────────────────────────────────────────

export interface WalletAccount {
  id: string;
  ownerType: WalletOwnerType;
  /** "DRIVER:{id}" | "VENDOR:{id}" | "PLATFORM_REVENUE" | "PLATFORM_CLEARING" */
  ownerKey: string;
  balanceKwd: Kwd;
  updatedAt?: string;
  /** Optional denormalized owner info some endpoints attach. */
  ownerName?: string | null;
}

export interface WalletEntry {
  id: string;
  transactionId: string;
  accountId: string;
  direction: WalletEntryDirection;
  amountKwd: Kwd;
  runningBalanceKwd: Kwd;
  createdAt: string;
  transaction?: {
    id?: string;
    type: WalletTxType;
    orderId?: string | null;
    remittanceId?: string | null;
    memo?: string | null;
    createdAt?: string;
    order?: { id: string; orderNumber: string } | null;
  } | null;
}

export interface Remittance {
  id: string;
  driverId: string;
  amountKwd: Kwd;
  method: RemittanceMethod;
  receiptUrl?: string | null;
  note?: string | null;
  receivedById?: string | null;
  createdAt: string;
  driver?: { id: string; name: string; phone?: string | null; driverCode?: string | null } | null;
  receivedBy?: { id: string; name: string } | null;
}

export interface WalletAdjustment {
  id: string;
  accountId: string;
  direction: WalletEntryDirection;
  amountKwd: Kwd;
  reason: string;
  createdAt: string;
  createdBy?: { id: string; name: string } | null;
  account?: WalletAccount | null;
}

export interface WalletReconciliationRun {
  id: string;
  runDate: string;
  status: "OK" | "MISMATCH";
  checks?: Record<string, unknown> | null;
  createdAt?: string;
}

// ── Incidents ────────────────────────────────────────────────────────────

export interface Incident {
  id: string;
  type: IncidentType;
  status: IncidentStatus;
  severity?: string | null;
  driverId?: string | null;
  orderId?: string | null;
  lat?: number | null;
  lng?: number | null;
  description?: string | null;
  reportedVia?: string | null;
  acknowledgedAt?: string | null;
  acknowledgedById?: string | null;
  resolvedAt?: string | null;
  resolvedById?: string | null;
  createdAt: string;
  driver?: { id: string; name: string; phone?: string | null } | null;
  order?: { id: string; orderNumber: string } | null;
  metadata?: Record<string, unknown> | null;
}

// ── Live positions ───────────────────────────────────────────────────────

export interface DriverPosition {
  driverId: string;
  lat: number;
  lng: number;
  /** Degrees clockwise from north, when the device reports one. */
  heading?: number | null;
  /** ISO timestamp of the fix. */
  at: string;
  availability?: DriverAvailability;
  name?: string | null;
  /** Darb-issued driver code ("DRB-0001"), for search and copy-to-clipboard. */
  driverCode?: string | null;
  phone?: string | null;
  vehicleType?: string | null;
  /** True while the driver is on an ASSIGNED or PICKED_UP order. */
  hasActiveOrder?: boolean;
  activeOrderId?: string | null;
  /** Computed client-side at store flush: now - at > 60s. */
  stale?: boolean;
}

/**
 * The status buckets ops filters and colours drivers by (client revision #3).
 * Derived, not stored: "idle" is an online driver with no active order, and
 * "stale" outranks everything because a driver we cannot see is the problem
 * worth surfacing first.
 */
export type DriverMapStatus = "busy" | "idle" | "online" | "offline" | "stale";

export function driverMapStatus(d: DriverPosition): DriverMapStatus {
  if (d.stale) return "stale";
  if (d.availability === "OFFLINE") return "offline";
  if (d.hasActiveOrder || d.availability === "BUSY") return "busy";
  return "idle";
}

// ── SSE events (plan §A7) ────────────────────────────────────────────────

export const DARB_EVENT_NAMES = [
  "order.created",
  "order.rejected",
  "order.assigned",
  "order.picked_up",
  "order.delivered",
  "order.failed",
  "order.cancelled",
  "order.dispatch_exhausted",
  "offer.sent",
  "offer.accepted",
  "offer.declined",
  "offer.expired",
  "driver.location",
  "driver.online",
  "driver.offline",
  "sos.raised",
  "incident.updated",
  "remittance.recorded",
  "wallet.reconciliation_failed",
] as const;

export type DarbEventName = (typeof DARB_EVENT_NAMES)[number];

export interface OrderEventPayload {
  orderId: string;
  orderNumber?: string;
  vendorId?: string;
  status?: DeliveryOrderStatus;
  driverId?: string | null;
  reason?: string | null;
  order?: DeliveryOrder;
}

export interface OfferEventPayload {
  offerId: string;
  orderId: string;
  driverId: string;
  round?: number;
  expiresAt?: string;
  status?: OfferStatus;
}

export interface DriverLocationPayload extends Partial<DriverPosition> {
  driverId: string;
  lat: number;
  lng: number;
  at: string;
}

export interface DriverPresencePayload {
  driverId: string;
  availability?: DriverAvailability;
  at?: string;
}

export interface IncidentEventPayload {
  incidentId: string;
  incident?: Incident;
  status?: IncidentStatus;
}

export interface RemittanceEventPayload {
  remittanceId: string;
  driverId?: string;
  amountKwd?: Kwd;
}

export interface ReconciliationFailedPayload {
  runId?: string;
  runDate?: string;
  checks?: Record<string, unknown>;
}

export type DarbLiveEvent =
  | { type: "order.created"; payload: OrderEventPayload }
  | { type: "order.rejected"; payload: OrderEventPayload }
  | { type: "order.assigned"; payload: OrderEventPayload }
  | { type: "order.picked_up"; payload: OrderEventPayload }
  | { type: "order.delivered"; payload: OrderEventPayload }
  | { type: "order.failed"; payload: OrderEventPayload }
  | { type: "order.cancelled"; payload: OrderEventPayload }
  | { type: "order.dispatch_exhausted"; payload: OrderEventPayload }
  | { type: "offer.sent"; payload: OfferEventPayload }
  | { type: "offer.accepted"; payload: OfferEventPayload }
  | { type: "offer.declined"; payload: OfferEventPayload }
  | { type: "offer.expired"; payload: OfferEventPayload }
  | { type: "driver.location"; payload: DriverLocationPayload }
  | { type: "driver.online"; payload: DriverPresencePayload }
  | { type: "driver.offline"; payload: DriverPresencePayload }
  | { type: "sos.raised"; payload: IncidentEventPayload }
  | { type: "incident.updated"; payload: IncidentEventPayload }
  | { type: "remittance.recorded"; payload: RemittanceEventPayload }
  | { type: "wallet.reconciliation_failed"; payload: ReconciliationFailedPayload };

// ── Misc API shapes ──────────────────────────────────────────────────────

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ZoneLoad {
  zoneId: string;
  activeOrders: number;
  /** Optional richer fields — used when the API provides them. */
  onlineDrivers?: number;
  loadRatio?: number;
  avgSlaRemainingSec?: number;
}

/**
 * A driver who has not moved for >3 minutes while on an active job.
 *
 * This is NOT a DeliveryOrder: /api/dispatch/overview builds a flat row per
 * stalled driver. It used to be typed as DeliveryOrder here, so the alerts
 * page read `driver.name`, `status` and `updatedAt` off it and silently got
 * undefined for all three.
 */
export interface StalledDriver {
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  orderId: string;
  orderNumber: string;
  orderStatus: DeliveryOrderStatus | string;
  lastPointAt: string;
  movedMeters: number;
  spanSec: number;
}

export interface DispatchOverview {
  jeopardy?: DeliveryOrder[];
  stalled?: StalledDriver[];
  gpsStale?: DriverPosition[];
  zoneLoads?: ZoneLoad[];
}

export interface FoodicsStatus {
  status: FoodicsConnStatus | string;
  connected?: boolean;
  lastEventAt?: string | null;
  orderTagId?: string | null;
  branchMap?: { foodicsBranchId: string; branchId: string | null; name?: string }[];
}

export interface VendorWallet {
  account?: WalletAccount | null;
  balanceKwd?: Kwd;
  /**
   * Revision 10 (#3) — the figure to show for whatever the branch pills are on:
   * the account total for All branches, that branch's own net when one is
   * picked. The card used to print `balanceKwd` regardless, so two branches
   * showed the identical number while the ledger under it changed.
   */
  scopedBalanceKwd?: Kwd;
  scopedBranchId?: string | null;
  /** Branch id → that branch's own net movement, as a 3dp string. */
  branchBalances?: Record<string, Kwd>;
  /** Postings that belong to no branch: payouts, top-ups, corrections. */
  unallocatedKwd?: Kwd;
  /**
   * Revision 11 (#2) — what that figure is made of, transaction type → net.
   * The client saw "KD -169.832 not tied to a branch" and asked what it was
   * for, which a bare number gives no way to find out.
   */
  unallocatedByType?: Record<string, Kwd>;
  /** Revision 10 (#2) — what to prefill the top-up field with. */
  suggestedTopUpKwd?: Kwd;
  /** What the shop owes right now. The floor of any useful top-up. */
  outstandingKwd?: Kwd;
  entries?: WalletEntry[];
  // PRD §11 credit line (null cap = no cap configured).
  creditCapKwd?: Kwd | null;
  creditUsedKwd?: Kwd;
  /** Headroom before new orders are refused. Null when no cap is set. */
  creditRemainingKwd?: Kwd | null;
  /** True once the debt has reached the cap and orders are being rejected. */
  creditSuspended?: boolean;
}

// ── Darb 2.0 PRD build ────────────────────────────────────────────────────

export interface VendorAnalytics {
  from: string;
  to: string;
  branchId: string | null;
  ordersTotal: number;
  revenueKwd: string;
  avgOrderValueKwd: string;
  uniqueCustomers: number;
  repeatBuyers: number;
  /**
   * Revision 10 (#4) — average minutes a driver waits at the shop between
   * arriving and being handed the order. Null when nothing in the period had
   * both stamps, which is a different claim from "zero minutes".
   */
  avgPrepMinutes?: number | null;
  /** How many orders that average is built from. */
  prepSampleSize?: number;
  /**
   * Revision 11 (#3) — the wider wait, which every delivered order can answer:
   * from the order being placed to it leaving with a driver. The prep card
   * falls back to this when no order in the period carries an arrival stamp,
   * which is what left it reading n/a. Deliberately a separate number: it
   * includes waiting for a driver, so averaging the two would mean neither.
   */
  avgHandoverMinutes?: number | null;
  handoverSampleSize?: number;
  topCustomers: Array<{ phone: string; name: string | null; orders: number; totalKwd: string }>;
  byDay: Array<{ day: string; orders: number; totalKwd: string }>;
}

export interface RefundRow {
  id: string;
  orderId: string;
  amountKwd: string;
  reason: string;
  status: "REQUESTED" | "PROCESSED" | "REJECTED";
  createdAt: string;
  order?: { id: string; orderNumber: string };
  vendor?: { id: string; name: string; code: string };
}

export interface VendorStatementRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceKwd: string;
  codNetKwd: string;
  prepaidFeesKwd: string;
  refundsKwd: string;
  closingBalanceKwd: string;
  status: "FINAL" | "PAID";
  // Present on the finance-wide list (/api/wallets/vendor-statements), absent
  // on the vendor portal's own statements, which are implicitly self-scoped.
  vendor?: { id: string; name: string; code: string } | null;
}

/**
 * Revision 4 (#4) — one line of the detailed report behind a statement row.
 * A DELIVERY row is an order; REFUND and PAYOUT are the two other things that
 * move a shop's balance in a period. `entries` are the double-entry postings
 * behind the row, for anyone reconciling against the ledger.
 */
export interface StatementTransaction {
  kind: "DELIVERY" | "REFUND" | "PAYOUT";
  date: string | null;
  orderId: string | null;
  orderNumber: string | null;
  reference: string | null;
  paymentMethod: string | null;
  orderTotalKwd: string | null;
  deliveryFeeKwd: string | null;
  codNetKwd: string;
  entries: {
    id: string;
    transactionType: string;
    account: string | null;
    direction: "DEBIT" | "CREDIT";
    amountKwd: string;
    runningBalanceKwd: string;
    createdAt: string;
  }[];
}

export interface StatementDetail {
  statement: VendorStatementRow & {
    vendor?: { id: string; name: string; code: string } | null;
  };
  rows: StatementTransaction[];
}

export interface FleetProfile {
  id: string;
  name: string;
  ownerGroup?: { id: string; name: string } | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  flatFeePerOrderKwd: string;
  minOnlineHoursPerDay: number | null;
  minDriversOnline: Record<string, number> | null;
  disciplineStatus: "OK" | "WARNED" | "THROTTLED" | "SUSPENDED" | "REMOVED";
  isActive: boolean;
  /**
   * Revision 13 (#6) — the caller's own role and tab list, so the rail and the
   * route fence agree with the server instead of 403ing after the click. Null
   * for an inspecting admin, who is not a fleet login and has no row to read.
   */
  portalRole?: FleetPortalRole | null;
  portalTabs?: FleetTab[] | null;
}

/** Revision 13 (#6) — the fleet portal's own tabs and roles. */
export type FleetTab =
  | "ROSTER"
  | "ISSUES"
  | "DOCUMENTS"
  | "SCORECARD"
  | "PAYOUTS"
  | "SUPPORT"
  | "TEAM";

export type FleetPortalRole = "OWNER" | "OPERATIONS" | "FINANCE";

/**
 * One login on a delivery company's own team. The vendor portal's branch
 * scoping becomes company scoping: `fleetPartnerIds` null means every company
 * in the owner group.
 */
export interface FleetTeamUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  fleetRole: FleetPortalRole;
  fleetTabs: FleetTab[] | null;
  effectiveTabs: FleetTab[];
  fleetPartnerIds: string[] | null;
  fleetPartnerId: string | null;
  isActive?: boolean;
  createdAt?: string;
}

export interface FleetTeamPayload {
  companies: Array<{ id: string; name: string }>;
  users: FleetTeamUser[];
}

/**
 * A portal login belonging to one delivery company. Created from the fleet
 * detail panel; the password is set by staff and handed over, because fleet
 * users have no invite/set-password flow the way staff accounts do.
 */
export interface FleetUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  isActive?: boolean;
  createdAt?: string;
}

export interface FleetDriverRow {
  id: string;
  name: string;
  phone: string;
  /** Revision 13 (#3) — the Darb-issued id. Null until Darb approves. */
  driverCode: string | null;
  status: string;
  vehicleType: string;
  performanceTier: string | null;
  throttledUntil: string | null;
  civilIdStatus: string | null;
  drivingLicenseStatus: string | null;
  vehicleRegStatus: string | null;
  healthCertStatus: string | null;
  rating: { avg: number | null; count: number };
  /**
   * Revision 12 — delivered orders today and across the last 7 days. A
   * supervisor's first question about a driver is how much they worked, and it
   * used to need a call to Darb.
   */
  ordersToday: number;
  ordersLast7d: number;
  /**
   * A driver put forward but not yet approved. They have NO Driver row, so the
   * row is drawn from the request itself and `id` is `pending:{requestId}`.
   */
  pending?: boolean;
  requestId?: string;
  submittedAt?: string;
}

// ── Revision 12: the fleet portal's request desk ──────────────────────────

export type FleetDocumentStatus =
  | "PENDING_REVIEW"
  | "VALID"
  | "REJECTED"
  | "EXPIRED"
  | "SUPERSEDED";

export interface FleetDocument {
  id: string;
  fleetPartnerId: string;
  driverId: string | null;
  type: string;
  fileKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  expiryDate: string | null;
  status: FleetDocumentStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  driver?: { id: string; name: string } | null;
}

export type FleetRequestType =
  | "DRIVER_ONBOARD"
  | "DRIVER_STATUS"
  | "DRIVER_PROFILE"
  | "DRIVER_DOCUMENT"
  | "COMPANY_DOCUMENT";

export type FleetRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";

export interface FleetChangeRequest {
  id: string;
  fleetPartnerId: string;
  type: FleetRequestType;
  driverId: string | null;
  payload: Record<string, unknown>;
  documentIds: string[];
  status: FleetRequestStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  driver?: { id: string; name: string; phone?: string } | null;
  requestedBy?: { id: string; name: string | null; email: string } | null;
  reviewedBy?: { id: string; name: string | null; email: string } | null;
  /** Populated on the staff read so a reviewer sees the scans, not ids. */
  documents?: FleetDocument[];
}

export type FleetIssueStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "ESCALATED";

export interface FleetIssue {
  id: string;
  fleetPartnerId: string;
  driverId: string | null;
  type: "LATE_LOGIN" | "NO_ORDERS" | "RATING_DROP" | "DOC_EXPIRING" | "ACCEPTANCE_LOW";
  severity: "LOW" | "MEDIUM" | "HIGH";
  title: string;
  detail: string;
  data: Record<string, unknown> | null;
  status: FleetIssueStatus;
  openedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  driver?: { id: string; name: string; phone?: string } | null;
  resolvedBy?: { id: string; name: string | null; email: string } | null;
}

export interface FleetDayCount {
  date: string;
  orders: number;
}

export interface FleetMonthActivity {
  month: string;
  days: FleetDayCount[];
  totalOrders: number;
  activeDays: number;
  avgPerActiveDay: number | null;
}

export interface FleetDriverProfile {
  driver: {
    id: string;
    name: string;
    phone: string;
    driverCode: string | null;
    status: string;
    vehicleType: string;
    zone: string | null;
    hireDate: string | null;
    performanceTier: string | null;
    throttledUntil: string | null;
    civilIdExpiry: string | null; civilIdStatus: string | null;
    drivingLicenseExpiry: string | null; drivingLicenseStatus: string | null;
    vehicleRegExpiry: string | null; vehicleRegStatus: string | null;
    vehicleInsuranceExpiry: string | null; vehicleInsuranceStatus: string | null;
    healthCertExpiry: string | null; healthCertStatus: string | null;
    workPermitExpiry: string | null; workPermitStatus: string | null;
    foodHandlingCertExpiry: string | null; foodHandlingCertStatus: string | null;
  };
  rating: { avg: number | null; count: number };
  documents: FleetDocument[];
  requests: FleetChangeRequest[];
  issues: FleetIssue[];
  activity: FleetMonthActivity;
  storageConfigured: boolean;
}

export interface FleetDocumentsPayload {
  documents: FleetDocument[];
  requiredTypes: string[];
  /**
   * False when R2 is not wired up on the backend. The portal says so plainly
   * rather than showing a file picker that dies.
   */
  storageConfigured: boolean;
}

/** One document being submitted, after the browser has PUT it to R2. */
export interface FleetDocumentInput {
  type: string;
  fileKey?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  expiryDate?: string | null;
}

export interface FleetScorecard {
  fleetPartnerId: string;
  /** The window the numbers were measured over, echoed back by the API. */
  periodFrom?: string;
  periodTo?: string;
  driverCount: number;
  deliveredOrders: number;
  onTimeRate: number | null;
  acceptanceRate: number | null;
  onlineHours: number;
  contractedHours: number | null;
  utilisation: number | null;
  avgRating: number | null;
  ratingCount: number;
}

export interface FleetStatementRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  deliveredOrders: number;
  feePerOrderKwd: string;
  totalKwd: string;
  /**
   * Revision 13 (#8) — the delivery company confirms before Darb pays.
   * postFleetPayout refuses anything that is not CONFIRMED.
   */
  status: "FINAL" | "CONFIRMED" | "DISPUTED" | "PAID";
  confirmedAt?: string | null;
  disputedAt?: string | null;
  disputeReason?: string | null;
  disputeTicketId?: string | null;
}

export interface FleetEarnings {
  periodStart: string;
  periodEnd: string;
  feePerOrderKwd: string;
  deliveredOrders: number;
  totalKwd: string;
  orders: Array<{
    id: string;
    orderNumber: string;
    deliveredAt: string;
    driverName: string | null;
    feeKwd: string;
  }>;
}

export interface CockpitSummary {
  generatedAt: string;
  orders: {
    activeNow: number;
    byStatus: Record<string, number>;
    deliveredToday: number;
    cancelledToday: number;
    noDriverToday: number;
    onTimeRateToday: number | null;
  };
  zones: Array<{
    zoneId: string;
    code: string;
    name: string;
    deliveredToday: number;
    onTimeRate: number | null;
  }>;
  money: {
    feesTodayKwd: string;
    fleetCostTodayKwd: string;
    netMarginTodayKwd: string;
    tipsTodayKwd: string;
  };
  fleet: {
    driversOnlineNow: number;
    driversBusyNow: number;
    fleets: Array<{
      fleetPartnerId: string;
      name: string;
      disciplineStatus: string;
      driversOnline: number;
      minDriversOnline: number | null;
      deliveredToday: number;
      /** Owner entity, when several fleets share one (revision #28). */
      ownerGroupId?: string | null;
      ownerGroupName?: string | null;
    }>;
  };
  cash: {
    driverCashInFieldKwd: string;
    depositedTodayKwd: string;
    clearingBalanceKwd: string;
  };
  alerts: Array<{ kind: string; severity: "HIGH" | "MEDIUM"; message: string }>;
}

/* ── Delivery plans (revision 4 #7) ── */

export type DeliveryPlanType = "ZONE" | "KM";

/** One cell of a by-zone plan's grid. Absent pair = unserviceable. */
export interface DeliveryPlanZoneRate {
  originZoneId: string;
  destZoneId: string;
  feeKwd: string;
}

/**
 * One band of a by-kilometre plan. `maxKm` null is the open-ended top band
 * ("14+ km"); `feeKwd` null marks the band unserviceable.
 */
export interface DeliveryPlanKmTier {
  id?: string;
  sortOrder?: number;
  maxKm: number | null;
  feeKwd: string | null;
}

export interface DeliveryPlan {
  id: string;
  name: string;
  type: DeliveryPlanType;
  isActive: boolean;
  // Revision 5 (#7) — this plan's own intra-zone flat fee. Null means it has
  // none and same-zone deliveries price off the grid's diagonal instead.
  intraZoneFeeKwd?: string | null;
  // Origin→destination pairs this plan leaves blank. Null on by-km plans and
  // on the list endpoint, which does not load the grid.
  unpricedPairs?: number | null;
  vendorCount: number;
  zoneRates: DeliveryPlanZoneRate[];
  kmTiers: DeliveryPlanKmTier[];
  createdAt?: string;
  updatedAt?: string;
}


// ── Support (revision 8, edit 6) ─────────────────────────────────────────

// Revision 10 (#5) — CANCELLED is the shop withdrawing its own request. Kept
// apart from RESOLVED, which means Darb dealt with it.
export type SupportTicketStatus = "OPEN" | "ANSWERED" | "RESOLVED" | "CANCELLED";

/** What a request is about, in the shop's own terms (revision 9, #6). */
export type SupportTicketType = "ORDER" | "WALLET" | "TECHNICAL" | "OTHER";

export interface SupportTicketMessage {
  id: string;
  author: "VENDOR" | "DARB";
  authorName?: string | null;
  body: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  type: SupportTicketType;
  orderId?: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Revision 11 (#4) — which of the shop's own people raised this. A Support
   * inbox is shared across the whole Team, so a thread of messages all labelled
   * "You" told an owner nothing about who asked or who withdrew it.
   */
  createdByName?: string | null;
  messages: SupportTicketMessage[];
}
