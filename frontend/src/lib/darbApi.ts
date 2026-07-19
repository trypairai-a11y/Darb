// Darb 2.0 — typed API fetchers over the shared axios instance (src/lib/api.ts).
// Paths follow plan §A8 exactly. All fetchers return response data (already
// unwrapped from the axios envelope); list endpoints tolerate both raw arrays
// and the standard paginatedResponse { data, pagination } shape.
import api from "@/lib/api";
import type {
  DeliveryOrder,
  DeliveryOrderEvent,
  DeliveryZone,
  DispatchCandidate,
  DispatchOverview,
  DriverPosition,
  FoodicsStatus,
  FulfillmentSettings,
  Incident,
  Kwd,
  Paginated,
  Remittance,
  Vendor,
  VendorBranch,
  VendorUser,
  VendorWallet,
  WalletAccount,
  WalletAdjustment,
  WalletEntry,
  WalletEntryDirection,
  WalletReconciliationRun,
  ZoneQuote,
  ZoneSurcharge,
} from "@/types/darb";

type Params = Record<string, string | number | boolean | undefined | null>;

function clean(params?: Params): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

/** Accepts either a bare array or a paginatedResponse envelope. */
export function unwrapList<T>(res: T[] | Paginated<T> | { data: T[] } | null | undefined): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray((res as { data?: T[] }).data)) return (res as { data: T[] }).data;
  return [];
}

async function get<T>(url: string, params?: Params): Promise<T> {
  const { data } = await api.get<T>(url, { params: clean(params) });
  return data;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.post<T>(url, body);
  return data;
}

async function put<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.put<T>(url, body);
  return data;
}

async function patch<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.patch<T>(url, body);
  return data;
}

async function del<T>(url: string): Promise<T> {
  const { data } = await api.delete<T>(url);
  return data;
}

// ── /api/zones ───────────────────────────────────────────────────────────

export const zonesApi = {
  list: (params?: Params) => get<DeliveryZone[] | Paginated<DeliveryZone>>("/api/zones", params),
  getById: (id: string) => get<DeliveryZone>(`/api/zones/${id}`),
  create: (body: Partial<DeliveryZone>) => post<DeliveryZone>("/api/zones", body),
  update: (id: string, body: Partial<DeliveryZone>) => put<DeliveryZone>(`/api/zones/${id}`, body),
  remove: (id: string) => del<{ success?: boolean }>(`/api/zones/${id}`),
  getSurcharges: () => get<ZoneSurcharge[] | { data: ZoneSurcharge[] }>("/api/zones/surcharges"),
  putSurcharges: (surcharges: ZoneSurcharge[]) =>
    put<{ success?: boolean }>("/api/zones/surcharges", { surcharges }),
  getSettings: () => get<FulfillmentSettings>("/api/zones/settings"),
  putSettings: (settings: Partial<FulfillmentSettings>) =>
    put<FulfillmentSettings>("/api/zones/settings", settings),
  quote: (body: { vendorId?: string; branchId?: string; dropoff: { lat: number; lng: number } }) =>
    post<ZoneQuote>("/api/zones/quote", body),
  resolve: (body: { lat: number; lng: number }) =>
    post<{ zone: DeliveryZone | null }>("/api/zones/resolve", body),
};

// ── /api/vendors ─────────────────────────────────────────────────────────

export const vendorsApi = {
  list: (params?: Params) => get<Vendor[] | Paginated<Vendor>>("/api/vendors", params),
  getById: (id: string) => get<Vendor>(`/api/vendors/${id}`),
  create: (body: Partial<Vendor>) => post<Vendor>("/api/vendors", body),
  update: (id: string, body: Partial<Vendor>) => put<Vendor>(`/api/vendors/${id}`, body),
  remove: (id: string) => del<{ success?: boolean }>(`/api/vendors/${id}`),
  listBranches: (vendorId: string) =>
    get<VendorBranch[] | { data: VendorBranch[] }>(`/api/vendors/${vendorId}/branches`),
  createBranch: (vendorId: string, body: Partial<VendorBranch>) =>
    post<VendorBranch>(`/api/vendors/${vendorId}/branches`, body),
  updateBranch: (vendorId: string, branchId: string, body: Partial<VendorBranch>) =>
    put<VendorBranch>(`/api/vendors/${vendorId}/branches/${branchId}`, body),
  removeBranch: (vendorId: string, branchId: string) =>
    del<{ success?: boolean }>(`/api/vendors/${vendorId}/branches/${branchId}`),
  createUser: (vendorId: string, body: { name: string; email: string; password: string }) =>
    post<VendorUser>(`/api/vendors/${vendorId}/users`, body),
  wallet: (vendorId: string, params?: Params) =>
    get<VendorWallet>(`/api/vendors/${vendorId}/wallet`, params),
};

// ── /api/delivery-orders ─────────────────────────────────────────────────

export const deliveryOrdersApi = {
  list: (params?: Params) =>
    get<Paginated<DeliveryOrder> | DeliveryOrder[]>("/api/delivery-orders", params),
  getById: (id: string) => get<DeliveryOrder>(`/api/delivery-orders/${id}`),
  timeline: (id: string) =>
    get<DeliveryOrderEvent[] | { data: DeliveryOrderEvent[] }>(`/api/delivery-orders/${id}/timeline`),
  /** Candidate drivers for manual (re)assignment — consumed by the reassign flow. */
  candidates: (id: string) =>
    get<DispatchCandidate[] | { data: DispatchCandidate[] }>(`/api/delivery-orders/${id}/candidates`),
  assign: (id: string, driverId: string) =>
    post<DeliveryOrder>(`/api/delivery-orders/${id}/assign`, { driverId }),
  redispatch: (id: string) => post<DeliveryOrder>(`/api/delivery-orders/${id}/redispatch`),
  cancel: (id: string, reason?: string) =>
    post<DeliveryOrder>(`/api/delivery-orders/${id}/cancel`, { reason }),
  updateDropoff: (id: string, body: { lat: number; lng: number; address?: string }) =>
    patch<DeliveryOrder>(`/api/delivery-orders/${id}/dropoff`, body),
};

// ── /api/wallets ─────────────────────────────────────────────────────────

export const walletsApi = {
  accounts: (params?: Params) =>
    get<WalletAccount[] | Paginated<WalletAccount>>("/api/wallets/accounts", params),
  entries: (params?: Params) =>
    get<Paginated<WalletEntry> | WalletEntry[]>("/api/wallets/entries", params),
  remittances: (params?: Params) =>
    get<Paginated<Remittance> | Remittance[]>("/api/wallets/remittances", params),
  createRemittance: (body: { driverId: string; amountKwd: number | string; method: string; note?: string }) =>
    post<Remittance>("/api/wallets/remittances", body),
  adjustments: (params?: Params) =>
    get<Paginated<WalletAdjustment> | WalletAdjustment[]>("/api/wallets/adjustments", params),
  createAdjustment: (body: {
    accountId: string;
    direction: WalletEntryDirection;
    amountKwd: number | string;
    reason: string;
  }) => post<WalletAdjustment>("/api/wallets/adjustments", body),
  reconciliation: (params?: Params) =>
    get<WalletReconciliationRun[] | Paginated<WalletReconciliationRun>>(
      "/api/wallets/reconciliation",
      params
    ),
};

// ── /api/incidents ───────────────────────────────────────────────────────

export const incidentsApi = {
  list: (params?: Params) => get<Paginated<Incident> | Incident[]>("/api/incidents", params),
  ack: (id: string) => post<Incident>(`/api/incidents/${id}/ack`),
  resolve: (id: string, note?: string) => post<Incident>(`/api/incidents/${id}/resolve`, { note }),
};

// ── /api/dispatch ────────────────────────────────────────────────────────

export const dispatchApi = {
  /** Bootstrap snapshot for the live map / driverPositionStore. */
  positions: () => get<DriverPosition[] | { data: DriverPosition[] }>("/api/dispatch/positions"),
  overview: () => get<DispatchOverview>("/api/dispatch/overview"),
};

// ── /api/vendor (vendor-portal scope — vendorId comes from the JWT) ──────

export const vendorApi = {
  me: () => get<{ vendor: Vendor; branches?: VendorBranch[] }>("/api/vendor/me"),
  orders: (params?: Params) =>
    get<Paginated<DeliveryOrder> | DeliveryOrder[]>("/api/vendor/orders", params),
  createOrder: (body: {
    branchId: string;
    customerName?: string;
    customerPhone: string;
    dropoffAddress?: string;
    dropoffLat?: number;
    dropoffLng?: number;
    orderTotalKwd: number | string;
    paymentMethod: string;
  }) => post<DeliveryOrder>("/api/vendor/orders", body),
  cancelOrder: (id: string, reason?: string) =>
    post<DeliveryOrder>(`/api/vendor/orders/${id}/cancel`, { reason }),
  pause: (isPaused: boolean) => post<Vendor>("/api/vendor/pause", { isPaused }),
  wallet: () => get<VendorWallet>("/api/vendor/wallet"),
  walletEntries: (params?: Params) =>
    get<Paginated<WalletEntry> | WalletEntry[]>("/api/vendor/wallet/entries", params),
  /** Vendor-scoped Foodics status (vendorId comes from the JWT). */
  foodicsStatus: () => get<FoodicsStatus>("/api/vendor/foodics/status"),
  /** Returns { authUrl } — the caller redirects the browser there. */
  foodicsConnect: () => get<{ authUrl: string }>("/api/vendor/foodics/connect"),
};

// ── /api/foodics ─────────────────────────────────────────────────────────

export const foodicsApi = {
  status: (params?: { vendorId?: string }) => get<FoodicsStatus>("/api/foodics/status", params),
  /** Returns { authUrl } — the caller redirects the browser there. */
  connect: (params?: { vendorId?: string }) =>
    get<{ authUrl: string }>("/api/foodics/connect", params),
  branchMap: (params?: { vendorId?: string }) =>
    get<FoodicsStatus["branchMap"]>("/api/foodics/branch-map", params),
  putBranchMap: (body: { vendorId?: string; map: { foodicsBranchId: string; branchId: string | null }[] }) =>
    put<{ success?: boolean }>("/api/foodics/branch-map", body),
};

export type { Kwd };
