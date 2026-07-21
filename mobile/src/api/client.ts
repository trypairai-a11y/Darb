import * as SecureStore from "expo-secure-store";

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://backend-snowy-ten-52.vercel.app";

/**
 * ApiError — thrown for non-2xx responses. Carries the HTTP status + the
 * backend's machine code (`body.code`, e.g. "CASH_CEILING_LOCKOUT",
 * "PIN_MISMATCH") so callers can branch on 409/410/422 without string-matching
 * the human message. `body` keeps extra fields (e.g. `attemptsLeft`).
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  body: any;
  constructor(status: number, body: any) {
    super(body?.error || body?.message || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code;
    this.body = body ?? {};
  }
}

export function isApiError(e: unknown, ...statuses: number[]): e is ApiError {
  return e instanceof ApiError && (statuses.length === 0 || statuses.includes(e.status));
}

async function getToken(): Promise<string | null> {
  // SecureStore rejects on web — treat as signed-out rather than crashing.
  return SecureStore.getItemAsync("agent_token").catch(() => null);
}

export async function hasToken(): Promise<boolean> {
  return (await getToken()) != null;
}

async function getDeviceId(): Promise<string> {
  const id = await SecureStore.getItemAsync("device_id");
  if (!id) throw new Error("Device not enrolled");
  return id;
}

async function agentFetchMultipart<T = any>(path: string, formData: FormData): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData as any,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body);
  }
  return res.json();
}

export async function agentFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body);
  }
  return res.json();
}

export async function register(enrollmentCode: string, deviceInfo: {
  imei?: string;
  model: string;
  osVersion: string;
  appVersion: string;
}): Promise<{ token: string; deviceId: string; driverId: string }> {
  const data = await agentFetch<any>("/api/agent/register", {
    method: "POST",
    body: JSON.stringify({ enrollmentCode, ...deviceInfo }),
  });
  await SecureStore.setItemAsync("agent_token", data.token);
  await SecureStore.setItemAsync("device_id", data.deviceId);
  if (data.driverId) await SecureStore.setItemAsync("driver_id", data.driverId);
  if (data.driver?.platform) await SecureStore.setItemAsync("driver_platform", data.driver.platform);
  return data;
}

export async function registerPushToken(expoPushToken: string): Promise<{ ok: true }> {
  const deviceId = await getDeviceId();
  return agentFetch<{ ok: true }>("/api/agent/push-token", {
    method: "POST",
    body: JSON.stringify({ deviceId, expoPushToken }),
  });
}

export interface DarbPointsResponse {
  driver: { id: string; name: string; platform: string; phone: string };
  period: { year: number; month: number };
  current: {
    totalScore: number;
    attendanceScore: number;
    ordersScore: number;
    hoursScore: number;
    violationsScore: number;
    onTimePct: number;
    ordersCount: number;
    hoursWorked: number;
    violationsCount: number;
    perPlatform: Record<string, { ordersCount: number; hoursWorked: number }> | null;
    computedAt: string;
  } | null;
  trend: { year: number; month: number; totalScore: number }[];
}

export async function fetchMyDarbPoints(): Promise<DarbPointsResponse> {
  return agentFetch<DarbPointsResponse>("/api/agent/points");
}

export async function heartbeat(payload: {
  deviceId: string;
  batteryLevel: number;
  appVersion: string;
  isLowPowerMode?: boolean;
  platformGuess?: string | null;
}) {
  return agentFetch("/api/agent/heartbeat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function uploadSelfie(payload: {
  type: "clock_in" | "clock_out";
  imageUri: string;
  latitude: number;
  longitude: number;
}) {
  const deviceId = await getDeviceId();
  const formData = new FormData();
  formData.append("deviceId", deviceId);
  formData.append("action", payload.type === "clock_in" ? "ACTION_CLOCK_IN" : "ACTION_CLOCK_OUT");
  formData.append("latitude", String(payload.latitude));
  formData.append("longitude", String(payload.longitude));
  formData.append("selfie", {
    uri: payload.imageUri,
    name: `${payload.type}.jpg`,
    type: "image/jpeg",
  } as any);
  return agentFetchMultipart("/api/agent/selfie", formData);
}

/**
 * POST /api/agent/location — bulk GPS ingest.
 *
 * Wave 1 fixes a bug in the legacy signature: the route handler at
 * `backend/src/routes/agent.ts:97` reads `req.body.deviceId` and `req.body.driverId`,
 * but the old client only sent `{ locations: batch }`. That meant every legacy upload
 * was rejected by the backend with a "missing deviceId" 400. New shape forwards both IDs
 * (resolved by the outbox from SecureStore) plus a tier-3 platform-attribution hint.
 *
 * Each location row carries an `idempotencyKey` so a server-side dedupe can collapse
 * duplicate uploads when the network retries the same batch.
 */
export async function uploadLocations(payload: {
  deviceId: string;
  driverId: string;
  locations: Array<{
    latitude: number;
    longitude: number;
    accuracy: number;
    speed?: number | null;
    capturedAt: string;
    idempotencyKey: string;
  }>;
  platformGuess?: string | null;
}): Promise<{ synced: number }> {
  return agentFetch("/api/agent/location", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * POST /api/agent/upload-url — request a presigned URL for direct delivery-photo upload.
 *
 * Wave 1 ships the client-side stub; the backend route lands in Wave 2. The mobile
 * photoService consumes this in the Wave 3 camera flow. Shape is locked here so Wave 2
 * + Wave 3 can land in either order without churn.
 */
export async function requestUploadUrl(payload: {
  deviceId: string;
  orderId: string;
  contentType?: string;
}): Promise<{ url: string; key: string; expiresInSec: number }> {
  return agentFetch("/api/agent/upload-url", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * POST /api/agent/delivery-photo — record metadata after the mobile client has finished
 * a presigned-URL PUT to the storage tier. Backend writes an OrderEvent row keyed to
 * the order + the storage key returned by `requestUploadUrl`.
 */
export async function recordDeliveryPhotoMetadata(payload: {
  deviceId: string;
  orderId: string;
  key: string;
  capturedAt: string;
  latitude: number;
  longitude: number;
}): Promise<{ ok: true }> {
  return agentFetch("/api/agent/delivery-photo", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function uploadCapturedOrders(orders: {
  platform: string;
  rawText: string;
  capturedAt: string;
}[]) {
  return agentFetch("/api/agent/captured-orders", {
    method: "POST",
    body: JSON.stringify({ orders }),
  });
}

export async function pollCommands(deviceId: string) {
  return agentFetch<any[]>(`/api/agent/commands?deviceId=${deviceId}`);
}

export async function ackCommand(commandId: string) {
  return agentFetch(`/api/agent/commands/${commandId}/ack`, { method: "POST" });
}

// ─── Driver-submitted tickets ───
export interface TicketRecord {
  id: string;
  ticketNumber: string;
  category: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  photos: string[] | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  slaDeadline: string | null;
}

export async function submitTicket(payload: {
  category: string;
  title: string;
  description: string;
  priority?: string;
  photos: { uri: string; mime?: string }[];
}): Promise<TicketRecord> {
  const deviceId = await getDeviceId();
  const formData = new FormData();
  formData.append("deviceId", deviceId);
  formData.append("category", payload.category);
  formData.append("title", payload.title);
  formData.append("description", payload.description);
  if (payload.priority) formData.append("priority", payload.priority);
  payload.photos.forEach((photo, i) => {
    formData.append("photos", {
      uri: photo.uri,
      name: `photo-${i}.jpg`,
      type: photo.mime ?? "image/jpeg",
    } as any);
  });
  return agentFetchMultipart<TicketRecord>("/api/agent/tickets", formData);
}

export async function listMyTickets(): Promise<TicketRecord[]> {
  const deviceId = await getDeviceId();
  return agentFetch<TicketRecord[]>(`/api/agent/tickets?deviceId=${encodeURIComponent(deviceId)}`);
}

export async function getMyTicket(id: string): Promise<TicketRecord> {
  const deviceId = await getDeviceId();
  return agentFetch<TicketRecord>(`/api/agent/tickets/${id}?deviceId=${encodeURIComponent(deviceId)}`);
}

// ─── Orders (last 7 days, up to 30) ───
export interface OrderRecord {
  id: string;
  platform: string;
  status: string;
  merchantName: string;
  deliveryAddress: string;
  amount: number;
  cashCollected: number;
  orderCount: number;
  orderNumber: string | null;
  createdAt: string;
}

export async function fetchMyOrders(): Promise<OrderRecord[]> {
  const res = await agentFetch<{ data: OrderRecord[] }>("/api/agent/orders");
  return res.data ?? [];
}

// ─── Shifts (next ±2 weeks, up to 40) ───
export interface ShiftRecord {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  area: string | null;
  status: string;
  actualStart: string | null;
  actualEnd: string | null;
  platform: string;
}

export async function fetchMyShifts(): Promise<ShiftRecord[]> {
  const res = await agentFetch<{ data: ShiftRecord[] }>("/api/agent/shifts");
  return res.data ?? [];
}

// ─── Equipment (issued kit the driver can report on) ───
export type EquipmentCondition = "OK" | "DAMAGED" | "CHANGED" | "CHANGE_REQUESTED";
export type ReportableCondition = "DAMAGED" | "CHANGED" | "CHANGE_REQUESTED";

export interface EquipmentItem {
  id: string;
  itemType: string;
  label: string;
  quantity: number;
  issued: boolean;
  issuedDate: string | null;
  condition: EquipmentCondition;
  conditionNote: string | null;
  conditionReportedAt: string | null;
}

export async function fetchMyEquipment(): Promise<EquipmentItem[]> {
  const deviceId = await getDeviceId();
  const res = await agentFetch<{ data: EquipmentItem[] }>(
    `/api/agent/equipment?deviceId=${encodeURIComponent(deviceId)}`
  );
  return res.data ?? [];
}

export async function reportEquipmentCondition(
  id: string,
  condition: ReportableCondition,
  note?: string
): Promise<EquipmentItem> {
  const deviceId = await getDeviceId();
  return agentFetch<EquipmentItem>(`/api/agent/equipment/${id}/condition`, {
    method: "POST",
    body: JSON.stringify({ deviceId, condition, note }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Darb 2.0 — delivery-loop agent API (contract: plan §A9, backend routes/agent*)
// All money values are KWD serialized as numbers or 3dp strings; the app
// formats with formatKwd() and never does float money math.
// ═══════════════════════════════════════════════════════════════════════════

export type Availability = "OFFLINE" | "ONLINE" | "BUSY";

/** Client-side order stage. Server FSM keeps coarse statuses (ASSIGNED /
 *  PICKED_UP); heading/arrived milestones are OrderEvents. `/state` reports the
 *  furthest milestone so the stepper can restore mid-delivery. */
export type OrderStage =
  | "HEADING_TO_PICKUP"
  | "ARRIVED_AT_PICKUP"
  | "PICKED_UP"
  | "HEADING_TO_DROPOFF"
  | "ARRIVED_AT_DROPOFF";

export interface AgentOfferSummary {
  id: string;
  restaurantName: string;
  pickupArea?: string | null;
  dropoffZone?: string | null;
  feeKwd: number | string;
  distanceKm?: number | string | null;
  paymentMethod?: "COD" | "PREPAID";
  codAmountKwd?: number | string | null;
  expiresAt: string; // ISO — countdown source of truth (with clock skew)
}

export interface AgentActiveOrder {
  id: string;
  orderNumber?: string | null;
  status: string; // server coarse status (ASSIGNED | PICKED_UP | …)
  stage?: OrderStage | null; // furthest milestone the server has seen
  slaDeadline?: string | null;
  paymentMethod?: "COD" | "PREPAID";
  codAmountKwd?: number | string | null;
  deliveryFeeKwd?: number | string | null;
  pickup?: { name?: string | null; address?: string | null; lat?: number | null; lng?: number | null; phone?: string | null } | null;
  dropoff?: { address?: string | null; lat?: number | null; lng?: number | null } | null;
  customerName?: string | null;
  customerPhone?: string | null;
}

export interface AgentWalletSummary {
  cashOnHandKwd: number | string;
  ceilingKwd: number | string;
  todayCollectedKwd?: number | string;
  todayDeliveries?: number;
  blocked?: boolean;
  /** 3dp KWD strings. Optional: old backends omit them (tips ship post-PRD;
   *  the driver keeps 100%). Render defensively — only when present. */
  tipsTodayKwd?: string;
  tipsTotalKwd?: string;
}

export interface AgentStateResponse {
  driver?: { id: string; name?: string; phone?: string | null; platform?: string | null } | null;
  availability: Availability;
  lockout?: { active: boolean; reason?: string | null } | boolean | null;
  activeOffer?: AgentOfferSummary | null;
  activeOrder?: AgentActiveOrder | null;
  wallet?: AgentWalletSummary | null;
  supervisorPhone?: string | null;
  serverTime: string; // ISO — clockSkewMs = serverTime - Date.now()
}

/** GET /api/agent/state — THE hydration + poll endpoint. */
export async function getState(): Promise<AgentStateResponse> {
  return agentFetch<AgentStateResponse>("/api/agent/state");
}

/** POST /api/agent/availability → 200 | 409 CASH_CEILING_LOCKOUT | 409 ACTIVE_ORDER. */
export async function postAvailability(availability: Availability): Promise<{ availability: Availability }> {
  return agentFetch("/api/agent/availability", {
    method: "POST",
    body: JSON.stringify({ availability }),
  });
}

/** POST /api/agent/offers/:id/accept → {order, serverTime} | 410/409 expired/withdrawn. */
export async function acceptOffer(offerId: string): Promise<{ order: AgentActiveOrder; serverTime?: string }> {
  return agentFetch(`/api/agent/offers/${encodeURIComponent(offerId)}/accept`, { method: "POST" });
}

/** POST /api/agent/offers/:id/reject — idempotent 200. */
export async function rejectOffer(offerId: string, reason?: string): Promise<{ ok: boolean }> {
  return agentFetch(`/api/agent/offers/${encodeURIComponent(offerId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** POST /api/agent/orders/:id/status — granular milestones, idempotency-keyed. */
export async function postOrderStatus(
  orderId: string,
  payload: {
    status: OrderStage;
    occurredAt: string;
    idempotencyKey: string;
    lat?: number;
    lng?: number;
  },
): Promise<{ ok: boolean; order?: AgentActiveOrder }> {
  return agentFetch(`/api/agent/orders/${encodeURIComponent(orderId)}/status`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/agent/orders/:id/pod — atomic verify + DELIVERED + wallet posting. */
export async function postPod(
  orderId: string,
  payload: {
    method: "PIN" | "PHOTO";
    pin?: string;
    photoKey?: string;
    codCollectedKwd?: number;
    lat: number;
    lng: number;
    idempotencyKey: string;
  },
): Promise<{ order?: AgentActiveOrder; wallet?: AgentWalletSummary }> {
  return agentFetch(`/api/agent/orders/${encodeURIComponent(orderId)}/pod`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/agent/orders/:id/failed → FAILED. */
export async function postOrderFailed(orderId: string, reason: string, note?: string): Promise<{ ok: boolean }> {
  return agentFetch(`/api/agent/orders/${encodeURIComponent(orderId)}/failed`, {
    method: "POST",
    body: JSON.stringify({ reason, note }),
  });
}

export interface AgentRemittance {
  id: string;
  amountKwd: number | string;
  method?: string | null;
  createdAt: string;
}

export interface AgentWalletResponse extends AgentWalletSummary {
  remittances?: AgentRemittance[];
}

/** GET /api/agent/wallet — cash/ceiling/today/lockout + remittance history. */
export async function getWallet(): Promise<AgentWalletResponse> {
  return agentFetch<AgentWalletResponse>("/api/agent/wallet");
}

export type IncidentCategory = "ACCIDENT" | "BREAKDOWN" | "CUSTOMER_AGGRESSION" | "ROAD_BLOCKAGE";

export interface AgentIncident {
  id: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | string;
  supervisorPhone?: string | null;
}

/** POST /api/agent/incidents — multipart, ≤3 photos (mirrors the tickets upload). */
export async function postIncident(payload: {
  category: IncidentCategory;
  description?: string;
  lat?: number;
  lng?: number;
  orderId?: string;
  photos?: { uri: string; mime?: string }[];
}): Promise<AgentIncident> {
  const deviceId = await getDeviceId();
  const formData = new FormData();
  formData.append("deviceId", deviceId);
  formData.append("category", payload.category);
  if (payload.description) formData.append("description", payload.description);
  if (payload.lat != null) formData.append("lat", String(payload.lat));
  if (payload.lng != null) formData.append("lng", String(payload.lng));
  if (payload.orderId) formData.append("orderId", payload.orderId);
  (payload.photos ?? []).slice(0, 3).forEach((photo, i) => {
    formData.append("photos", {
      uri: photo.uri,
      name: `incident-${i}.jpg`,
      type: photo.mime ?? "image/jpeg",
    } as any);
  });
  return agentFetchMultipart<AgentIncident>("/api/agent/incidents", formData);
}

/** GET /api/agent/incidents/:id — 10s status poll after an SOS. */
export async function getIncident(id: string): Promise<AgentIncident> {
  return agentFetch<AgentIncident>(`/api/agent/incidents/${encodeURIComponent(id)}`);
}

// ─── Identity helpers (for components that need the resolved driver id) ───
export async function getStoredDriverId(): Promise<string | null> {
  return SecureStore.getItemAsync("driver_id");
}

/**
 * Sign the device out. There is no server-side revoke endpoint for agent device
 * tokens, so this clears all locally-held enrollment material. Callers should
 * stop the GPS beacon and route back to /enrollment afterwards.
 */
export async function unenroll(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync("agent_token"),
    SecureStore.deleteItemAsync("device_id"),
    SecureStore.deleteItemAsync("driver_id"),
    SecureStore.deleteItemAsync("driver_platform"),
  ]);
}
