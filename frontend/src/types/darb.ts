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
  | "VENDOR_PAYOUT";

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
  entries?: WalletEntry[];
  // PRD §11 credit line (null cap = no cap configured).
  creditCapKwd?: Kwd | null;
  creditUsedKwd?: Kwd;
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
}

export interface FleetDriverRow {
  id: string;
  name: string;
  phone: string;
  status: string;
  vehicleType: string;
  performanceTier: string | null;
  throttledUntil: string | null;
  civilIdStatus: string | null;
  drivingLicenseStatus: string | null;
  vehicleRegStatus: string | null;
  healthCertStatus: string | null;
  rating: { avg: number | null; count: number };
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
  status: "FINAL" | "PAID";
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
