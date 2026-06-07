import * as SecureStore from "expo-secure-store";

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://backend-snowy-ten-52.vercel.app";

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync("agent_token");
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
    throw new Error(body.error || `HTTP ${res.status}`);
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
    throw new Error(body.error || `HTTP ${res.status}`);
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
