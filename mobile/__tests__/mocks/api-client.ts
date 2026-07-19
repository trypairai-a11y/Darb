/**
 * Mock of `mobile/src/api/client`. All named exports become jest.fn() seams;
 * each test injects behaviour via .mockResolvedValueOnce / .mockRejectedValueOnce.
 *
 * The mock is exposed under __mockApi for ergonomic test code:
 *   import { __mockApi as mockApi } from "../__tests__/mocks/api-client";
 *   mockApi.uploadLocations.mockResolvedValueOnce({ synced: 5 });
 */

export const BASE_URL = "http://localhost:3001";

export const agentFetch = jest.fn(async (_path: string, _options?: any) => ({}));
export const register = jest.fn(async (_code: string, _info: any) => ({
  token: "t",
  deviceId: "d",
  driverId: "drv",
}));
export const heartbeat = jest.fn(async (_payload: any) => ({}));
export const uploadSelfie = jest.fn(async (_payload: any) => ({}));
export const uploadLocations = jest.fn(async (_batch: any[]) => ({ synced: 0 }));
export const uploadCapturedOrders = jest.fn(async (_orders: any[]) => ({}));
export const pollCommands = jest.fn(async (_deviceId: string) => [] as any[]);
export const ackCommand = jest.fn(async (_commandId: string) => ({}));
export const fetchMyDarbPoints = jest.fn(async () => ({}));
export const submitTicket = jest.fn(async (_payload: any) => ({}));
export const listMyTickets = jest.fn(async () => []);
export const getMyTicket = jest.fn(async (_id: string) => ({}));

// Wave 1+ exports (do not exist in real client yet — tests reference them as RED seams):
export const requestUploadUrl = jest.fn(
  async (_payload: { deviceId: string; orderId: string; contentType: string }) => ({
    url: "https://r2.example/x",
    key: "tenA/order1/dev1/12345.jpg",
    expiresInSec: 300,
  }),
);
export const recordDeliveryPhotoMetadata = jest.fn(async (_payload: any) => ({ ok: true }));

// ─── Darb 2.0 delivery-loop surface ─────────────────────────────────────────
// ApiError mirrors the real client's class (re-implemented here because the
// moduleNameMapper regex would rewrite any import of the real module back to
// this mock). Tests throw `new ApiError(409, {...})` to simulate conflicts.
export class ApiError extends Error {
  status: number;
  code?: string;
  body: any;
  constructor(status: number, body: any = {}) {
    super(body?.error || body?.message || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code;
    this.body = body;
  }
}

export function isApiError(e: unknown, ...statuses: number[]): e is ApiError {
  return e instanceof ApiError && (statuses.length === 0 || statuses.includes(e.status));
}

export const hasToken = jest.fn(async () => true);
export const getState = jest.fn(async (): Promise<any> => ({
  availability: "OFFLINE",
  serverTime: new Date().toISOString(),
}));
export const postAvailability = jest.fn(async (_availability: string) => ({ availability: _availability }));
export const acceptOffer = jest.fn(async (_offerId: string) => ({ order: { id: "ord1", status: "ASSIGNED" } }));
export const rejectOffer = jest.fn(async (_offerId: string, _reason?: string) => ({ ok: true }));
export const postOrderStatus = jest.fn(async (_orderId: string, _payload: any) => ({ ok: true }));
export const postPod = jest.fn(async (_orderId: string, _payload: any) => ({}));
export const postOrderFailed = jest.fn(async (_orderId: string, _reason: string) => ({ ok: true }));
export const getWallet = jest.fn(async () => ({ cashOnHandKwd: 0, ceilingKwd: 100 }));
export const postIncident = jest.fn(async (_payload: any) => ({ id: "inc1", status: "OPEN" }));
export const getIncident = jest.fn(async (_id: string) => ({ id: "inc1", status: "OPEN" }));
export const fetchMyOrders = jest.fn(async () => [] as any[]);
export const fetchMyShifts = jest.fn(async () => [] as any[]);
export const fetchMyEquipment = jest.fn(async () => [] as any[]);
export const reportEquipmentCondition = jest.fn(async (_id: string, _c: any, _n?: string) => ({}));
export const registerPushToken = jest.fn(async (_token: string) => ({ ok: true }));
export const getStoredDriverId = jest.fn(async () => "drv");
export const unenroll = jest.fn(async () => {});

export const __mockApi = {
  agentFetch,
  register,
  heartbeat,
  uploadSelfie,
  uploadLocations,
  uploadCapturedOrders,
  pollCommands,
  ackCommand,
  fetchMyDarbPoints,
  submitTicket,
  listMyTickets,
  getMyTicket,
  requestUploadUrl,
  recordDeliveryPhotoMetadata,
  hasToken,
  getState,
  postAvailability,
  acceptOffer,
  rejectOffer,
  postOrderStatus,
  postPod,
  postOrderFailed,
  getWallet,
  postIncident,
  getIncident,
  fetchMyOrders,
  registerPushToken,
  unenroll,
};
