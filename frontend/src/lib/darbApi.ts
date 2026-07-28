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
  VendorPortalRole,
  VendorWallet,
  WalletAccount,
  WalletAdjustment,
  WalletEntry,
  WalletEntryDirection,
  WalletReconciliationRun,
  ZoneQuote,
  ZoneSurcharge,
  VendorAnalytics,
  RefundRow,
  DeliveryPlan,
  DeliveryPlanKmTier,
  DeliveryPlanType,
  DeliveryPlanZoneRate,
  StatementDetail,
  VendorStatementRow,
  FleetProfile,
  FleetDriverRow,
  FleetScorecard,
  FleetStatementRow,
  FleetEarnings,
  CockpitSummary,
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

/**
 * Fetch every page of a paginated list.
 *
 * The server clamps `limit` to 100 (getPagination), so asking for 500 or 1000
 * silently returns the first 100 rows. Anything that aggregates or exports —
 * balances, KPI totals, CSV statements — must page through instead, or it
 * quietly reports a number that is only true for a small dataset.
 */
export async function fetchAllPages<T>(
  fetchPage: (params: Params) => Promise<T[] | Paginated<T> | { data: T[] }>,
  params: Params = {},
  maxPages = 50
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchPage({ ...params, page, limit: 100 });
    out.push(...unwrapList<T>(res));
    const pagination = (res as Paginated<T>)?.pagination;
    // A bare array means the endpoint isn't paginated — one call is all there is.
    if (!pagination || page >= pagination.totalPages) break;
  }
  return out;
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
  /**
   * Every zone, not the first page of them.
   *
   * /api/zones paginates at 20 by default and caps at 100, and the surcharge
   * matrix editor sends the complete grid on save — the endpoint deletes any
   * pair absent from the body. Those two facts together mean a partial zone
   * list is not a display bug, it is silent deletion of the prices for every
   * zone that fell off the page. So this pages to the end, and callers that
   * build a grid must use it rather than list().
   */
  listAll: async (): Promise<DeliveryZone[]> => {
    const out: DeliveryZone[] = [];
    for (let page = 1; page <= 50; page++) {
      const res = await get<DeliveryZone[] | Paginated<DeliveryZone>>("/api/zones", {
        page,
        limit: 100,
      });
      const batch = unwrapList<DeliveryZone>(res);
      out.push(...batch);
      const total = (res as Paginated<DeliveryZone>)?.pagination?.total;
      if (Array.isArray(res) || batch.length === 0 || (total != null && out.length >= total)) break;
    }
    return out;
  },
  getById: (id: string) => get<DeliveryZone>(`/api/zones/${id}`),
  create: (body: Partial<DeliveryZone>) => post<DeliveryZone>("/api/zones", body),
  update: (id: string, body: Partial<DeliveryZone>) => put<DeliveryZone>(`/api/zones/${id}`, body),
  remove: (id: string) => del<{ success?: boolean }>(`/api/zones/${id}`),
  getSurcharges: () => get<ZoneSurcharge[] | { data: ZoneSurcharge[] }>("/api/zones/surcharges"),
  // The endpoint takes the matrix as a bare array, not wrapped.
  putSurcharges: (surcharges: ZoneSurcharge[]) =>
    put<{ success?: boolean }>("/api/zones/surcharges", surcharges),
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
  // Branch update/delete are mounted without a vendor segment (the handler
  // scopes by branchId + tenantId) — see swagger /api/vendors/branches/{id}.
  updateBranch: (_vendorId: string, branchId: string, body: Partial<VendorBranch>) =>
    put<VendorBranch>(`/api/vendors/branches/${branchId}`, body),
  removeBranch: (_vendorId: string, branchId: string) =>
    del<{ success?: boolean }>(`/api/vendors/branches/${branchId}`),
  users: (vendorId: string) => get<VendorUser[]>(`/api/vendors/${vendorId}/users`),
  createUser: (
    vendorId: string,
    body: {
      name: string;
      email: string;
      password: string;
      /** Revision 4 (#9) — the branch calls this person when an order stalls. */
      phone?: string;
      vendorRole: VendorPortalRole;
      branchId?: string | null;
    }
  ) => post<VendorUser>(`/api/vendors/${vendorId}/users`, body),
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
  vendorStatements: (params?: Params) =>
    get<Paginated<VendorStatementRow> | VendorStatementRow[]>(
      "/api/wallets/vendor-statements",
      params
    ),
  /** Revision 4 (#4) — every transaction behind one shop's statement period. */
  statementTransactions: (statementId: string) =>
    get<StatementDetail>(`/api/wallets/vendor-statements/${statementId}/transactions`),
};

// ── /api/delivery-plans (revision 4 #7) ──────────────────────────────────

export const deliveryPlansApi = {
  list: (params?: Params) =>
    get<Paginated<DeliveryPlan> | DeliveryPlan[]>("/api/delivery-plans", params),
  getById: (id: string) => get<DeliveryPlan>(`/api/delivery-plans/${id}`),
  create: (body: { name: string; type: DeliveryPlanType }) =>
    post<DeliveryPlan>("/api/delivery-plans", body),
  update: (
    id: string,
    // Revision 5 (#7): null clears the plan's own intra-zone fee and puts it
    // back on the grid's diagonal.
    body: { name?: string; isActive?: boolean; intraZoneFeeKwd?: string | null }
  ) => put<DeliveryPlan>(`/api/delivery-plans/${id}`, body),
  /** Rates are replaced wholesale — a plan is never half-priced. */
  putRates: (
    id: string,
    body: { zoneRates?: DeliveryPlanZoneRate[]; kmTiers?: DeliveryPlanKmTier[] }
  ) => put<DeliveryPlan>(`/api/delivery-plans/${id}/rates`, body),
  remove: (id: string) => del<void>(`/api/delivery-plans/${id}`),
};

// ── /api/incidents ───────────────────────────────────────────────────────

export const incidentsApi = {
  list: (params?: Params) => get<Paginated<Incident> | Incident[]>("/api/incidents", params),
  ack: (id: string) => post<Incident>(`/api/incidents/${id}/ack`),
  // The field is resolutionNote — zod strips a stray `note`, so the text was
  // silently dropped while the request still returned 200.
  resolve: (id: string, resolutionNote?: string) =>
    post<Incident>(`/api/incidents/${id}/resolve`, { resolutionNote }),
};

// ── /api/dispatch ────────────────────────────────────────────────────────

export const dispatchApi = {
  /** Bootstrap snapshot for the live map / driverPositionStore. */
  positions: () => get<DriverPosition[] | { data: DriverPosition[] }>("/api/dispatch/positions"),
  overview: () => get<DispatchOverview>("/api/dispatch/overview"),
};

// ── /api/vendor (vendor-portal scope — vendorId comes from the JWT) ──────

export const vendorApi = {
  // Returns the vendor flat at the root, with its branches alongside.
  me: () => get<Vendor & { branches?: VendorBranch[] }>("/api/vendor/me"),
  orders: (params?: Params) =>
    get<Paginated<DeliveryOrder> | DeliveryOrder[]>("/api/vendor/orders", params),
  // The backend takes the dropoff nested — zod strips unknown keys, so a flat
  // dropoffLat/dropoffLng silently loses the coordinates rather than erroring.
  createOrder: (body: {
    branchId: string;
    customerName?: string;
    customerPhone: string;
    dropoffAddress?: string;
    dropoff: { lat?: number; lng?: number; zoneId?: string };
    orderTotalKwd: number | string;
    paymentMethod: string;
  }) => post<DeliveryOrder>("/api/vendor/orders", body),
  // reason is required by the backend schema — the caller must collect one.
  cancelOrder: (id: string, reason: string) =>
    post<DeliveryOrder>(`/api/vendor/orders/${id}/cancel`, { reason }),
  // Vendor-scoped mirrors of /api/zones — VENDOR tokens are contained to
  // /api/vendor and get a 403 on the staff zone routes.
  zones: () => get<DeliveryZone[]>("/api/vendor/zones"),
  quote: (body: { branchId: string; dropoff: { lat: number; lng: number } }) =>
    post<ZoneQuote>("/api/vendor/quote", body),
  pause: (paused: boolean) => post<Vendor>("/api/vendor/pause", { paused }),
  wallet: () => get<VendorWallet>("/api/vendor/wallet"),
  walletEntries: (params?: Params) =>
    get<Paginated<WalletEntry> | WalletEntry[]>("/api/vendor/wallet/entries", params),
  /** Vendor-scoped Foodics status (vendorId comes from the JWT). */
  foodicsStatus: () => get<FoodicsStatus>("/api/vendor/foodics/status"),
  /** Returns { authUrl } — the caller redirects the browser there. */
  foodicsConnect: () => get<{ authUrl: string }>("/api/vendor/foodics/connect"),
  // ── PRD build: analytics, refunds, statements ──
  analytics: (params?: { from?: string; to?: string; branchId?: string | null }) =>
    get<VendorAnalytics>("/api/vendor/analytics", params as Params),
  refunds: () => get<RefundRow[]>("/api/vendor/refunds"),
  /** 409 means a refund request already exists for this order. */
  requestRefund: (orderId: string, reason: string) =>
    post<RefundRow>(`/api/vendor/orders/${orderId}/refund-request`, { reason }),
  statements: () => get<VendorStatementRow[]>("/api/vendor/statements"),
};

// ── /api/fleet (fleet-portal scope — fleetPartnerId comes from the JWT) ──

export const fleetApi = {
  me: () => get<FleetProfile>("/api/fleet/me"),
  drivers: () => get<FleetDriverRow[]>("/api/fleet/drivers"),
  scorecard: (params?: { from?: string; to?: string }) =>
    get<FleetScorecard>("/api/fleet/scorecard", params as Params),
  statements: () => get<FleetStatementRow[]>("/api/fleet/statements"),
  earnings: (params?: { month?: string }) =>
    get<FleetEarnings>("/api/fleet/earnings", params as Params),
};

// ── /api/fleets (staff scope) ────────────────────────────────────────────

export const fleetsApi = {
  list: (params?: Params) =>
    get<Paginated<FleetProfile> | FleetProfile[]>("/api/fleets", params),
  getById: (id: string) => get<FleetProfile>(`/api/fleets/${id}`),
  scorecard: (id: string, params?: { from?: string; to?: string }) =>
    get<FleetScorecard>(`/api/fleets/${id}/scorecard`, params as Params),
  statements: (id: string) => get<FleetStatementRow[]>(`/api/fleets/${id}/statements`),
};

// ── /api/cockpit (ADMIN-only founder summary) ────────────────────────────

export const cockpitApi = {
  /** `from`/`to` are YYYY-MM-DD; omitted, the API scopes to today. */
  summary: (params?: { from?: string; to?: string }) =>
    get<CockpitSummary>("/api/cockpit/summary", params),
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
