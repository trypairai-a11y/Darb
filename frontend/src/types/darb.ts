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
  | "PICKED_UP"
  | "DELIVERED"
  | "FAILED"
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
  | "VENDOR_PAUSED";

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
  serviceable: boolean;
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
  createdAt?: string;
  updatedAt?: string;
  branches?: VendorBranch[];
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
  isActive?: boolean;
}

export interface VendorUser {
  id: string;
  name: string;
  email: string;
  role: "VENDOR";
  createdAt?: string;
}

// ── Delivery orders ──────────────────────────────────────────────────────

export interface DeliveryOrder {
  id: string;
  orderNumber: string;
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
  driver?: { id: string; name: string } | null;
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
  phone?: string | null;
  vehicleType?: string | null;
  /** Computed client-side at store flush: now - at > 60s. */
  stale?: boolean;
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

export interface DispatchOverview {
  jeopardy?: DeliveryOrder[];
  stalled?: DeliveryOrder[];
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
}
