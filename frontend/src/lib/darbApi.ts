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
  FleetUser,
  FleetEarnings,
  FleetDocument,
  FleetDocumentInput,
  FleetDocumentsPayload,
  FleetChangeRequest,
  FleetDriverProfile,
  FleetIssue,
  FleetMonthActivity,
  CockpitSummary,
  SupportTicket,
  SupportTicketType,
  VendorTab,
  VendorTopUp,
  OrderImportResult,
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

/**
 * Admin inspection of a portal (see backend middleware/vendorScope and
 * middleware/fleetScope).
 *
 * An ADMIN carries neither a vendorId nor a fleetPartnerId in their token, so
 * every portal call has to name the account it means. Rather than thread that
 * through ~20 call sites and hope nobody forgets one, it is set once by the
 * portal's layout and appended here. Both are null for a portal user's own
 * session, where the id comes from the JWT and the client must not be able to
 * override it.
 */
/**
 * The id an inspecting admin is scoped to, read from the URL at request time.
 *
 * This was a module variable set by each portal's layout, which meant it had to
 * be written before any child fired a query, and that ordering did not hold:
 * the first /api/fleet/* calls went out unscoped and came back 403. Reading the
 * URL here cannot be raced, because the URL is already correct by the time any
 * request is made.
 *
 * A portal user's own session is unaffected. vendorScope and fleetScope take
 * the id from the JWT for VENDOR and FLEET tokens and ignore the query
 * entirely, so a stray ?vendorId= in a merchant's address bar changes nothing.
 *
 * The trailing slashes matter: /api/vendors and /api/fleets are the staff CRUD
 * surfaces, scoped by their own route params rather than by this.
 */
function inspectParams(url: string): Params | null {
  if (typeof window === "undefined") return null;
  const key = url.startsWith("/api/vendor/")
    ? "vendorId"
    : url.startsWith("/api/fleet/")
      ? "fleetPartnerId"
      : null;
  if (!key) return null;
  const id = new URLSearchParams(window.location.search).get(key);
  return id ? { [key]: id } : null;
}

async function get<T>(url: string, params?: Params): Promise<T> {
  const scope = inspectParams(url);
  const { data } = await api.get<T>(url, { params: clean(scope ? { ...params, ...scope } : params) });
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
  listAll: (): Promise<DeliveryZone[]> =>
    fetchAllPages<DeliveryZone>((params) =>
      get<DeliveryZone[] | Paginated<DeliveryZone>>("/api/zones", params),
    ),
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
  /** Record (or correct) why a FAILED / CANCELLED / RETURNED order ended. */
  recordReason: (id: string, reason: string) =>
    patch<DeliveryOrder>(`/api/delivery-orders/${id}/reason`, { reason }),
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
  // One order, with its real event log. The server names the events `timeline`,
  // not `events` — the detail page read `events`, found nothing, and silently
  // fell back to a four-step timeline derived from the order's own timestamps.
  order: (id: string) =>
    get<DeliveryOrder & { timeline?: DeliveryOrderEvent[] }>(`/api/vendor/orders/${id}`),
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
    /** ISO timestamp for a scheduled pickup; omit to dispatch immediately. */
    scheduledAt?: string;
  }) => post<DeliveryOrder>("/api/vendor/orders", body),
  /** This vendor's orders as a workbook, honouring the branch/date filters. */
  ordersExportUrl: (params: { branchId?: string | null; from?: string; to?: string; vendorId?: string | null }) => {
    const q = new URLSearchParams();
    if (params.branchId) q.set("branchId", params.branchId);
    if (params.vendorId) q.set("vendorId", params.vendorId);
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    const qs = q.toString();
    return `/api/vendor/orders/export.xlsx${qs ? `?${qs}` : ""}`;
  },
  // reason is required by the backend schema — the caller must collect one.
  cancelOrder: (id: string, reason: string) =>
    post<DeliveryOrder>(`/api/vendor/orders/${id}/cancel`, { reason }),
  // Vendor-scoped mirrors of /api/zones — VENDOR tokens are contained to
  // /api/vendor and get a 403 on the staff zone routes.
  zones: () => get<DeliveryZone[]>("/api/vendor/zones"),
  quote: (body: { branchId: string; dropoff: { lat: number; lng: number } }) =>
    post<ZoneQuote>("/api/vendor/quote", body),
  // Revision 10 (#7): a branchId pauses that counter alone; omit it for the
  // whole account, which is what the toggle always did.
  pause: (paused: boolean, branchId?: string | null) =>
    post<{ ok: boolean; isPaused: boolean; branchId?: string }>("/api/vendor/pause", {
      paused,
      ...(branchId ? { branchId } : {}),
    }),
  // branchId is what makes the balance figure follow the branch pills
  // (revision 10, #3). Without it the endpoint answers with the account total.
  wallet: (params?: { branchId?: string | null }) =>
    get<VendorWallet>("/api/vendor/wallet", params as Params),
  // ── Revision 10 (#2): top up ──
  createTopUp: (amountKwd: string) =>
    post<VendorTopUp>("/api/vendor/wallet/top-up", { amountKwd }),
  topUps: () => get<VendorTopUp[]>("/api/vendor/wallet/top-ups"),
  cancelTopUp: (id: string) =>
    post<{ ok: boolean }>(`/api/vendor/wallet/top-ups/${id}/cancel`, {}),
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
  // ── Revision 8 (#7): the shop's own team, OWNER only ──
  // ── Revision 8 (#6): support, open to every shop role ──
  support: (params?: { type?: string; status?: string }) =>
    get<SupportTicket[]>("/api/vendor/support", params as Params),
  createTicket: (body: { type: SupportTicketType; subject: string; body: string; orderId?: string | null }) =>
    post<SupportTicket>("/api/vendor/support", body),
  replyToTicket: (id: string, body: string) =>
    post<SupportTicket>(`/api/vendor/support/${id}/reply`, { body }),
  /** Revision 10 (#5) — the shop withdraws its own request. 409 if Darb closed it first. */
  cancelTicket: (id: string, reason?: string) =>
    post<SupportTicket>(`/api/vendor/support/${id}/cancel`, { reason: reason ?? "" }),
  team: () => get<VendorUser[]>("/api/vendor/team"),
  createTeamUser: (body: {
    email: string; password: string; name: string; phone?: string;
    vendorRole: VendorPortalRole; branchId?: string | null;
    /** Revision 10 (#6). Omit to inherit the role's tabs. */
    vendorTabs?: VendorTab[] | null;
  }) => post<VendorUser>("/api/vendor/team", body),
  updateTeamUser: (
    id: string,
    body: {
      isActive?: boolean;
      vendorRole?: VendorPortalRole;
      branchId?: string | null;
      /** null resets the person to their role's tabs; a list replaces it. */
      vendorTabs?: VendorTab[] | null;
    },
  ) => patch<VendorUser>(`/api/vendor/team/${id}`, body),
  // ── Revision 10 (#1): bulk order import ──
  /**
   * The blank template, generated from this shop's own branches and the live
   * zone list. A plain URL rather than a fetch: the browser downloads it.
   */
  orderImportTemplateUrl: (params?: { branchId?: string | null; vendorId?: string | null }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.set("branchId", params.branchId);
    if (params?.vendorId) q.set("vendorId", params.vendorId);
    const qs = q.toString();
    return `/api/vendor/orders/import-template.xlsx${qs ? `?${qs}` : ""}`;
  },
  /**
   * Post the filled-in workbook. multipart, so it goes through the shared axios
   * instance with the boundary the browser sets: passing FormData and no
   * Content-Type is what lets it do that.
   */
  bulkImportOrders: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return post<OrderImportResult>("/api/vendor/orders/bulk-import", form);
  },
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

  // ── Revision 12: the request desk ──────────────────────────────────────
  // Everything below either reads the fleet's own records or opens a request
  // for Darb to review. `updatePhone` is the ONE call that writes a live
  // record, and it is the client's own named exception.

  documents: () => get<FleetDocumentsPayload>("/api/fleet/documents"),
  documentUrl: (id: string) => get<{ url: string }>(`/api/fleet/documents/${id}/url`),
  /**
   * Ask the backend to sign a direct-to-R2 PUT. Answers 503 with
   * code STORAGE_NOT_CONFIGURED when R2 is not wired up, which the upload
   * helper turns into a plain sentence rather than a broken picker.
   */
  documentUploadUrl: (body: { type: string; contentType: string; fileName?: string }) =>
    post<{ url: string; key: string; expiresInSec: number }>(
      "/api/fleet/documents/upload-url",
      body,
    ),
  addCompanyDocument: (body: FleetDocumentInput) =>
    post<{ document: FleetDocument; requestId: string }>("/api/fleet/documents", body),

  driver: (id: string, params?: { month?: string }) =>
    get<FleetDriverProfile>(`/api/fleet/drivers/${id}`, params as Params),
  driverActivity: (id: string, params?: { month?: string }) =>
    get<FleetMonthActivity>(`/api/fleet/drivers/${id}/activity`, params as Params),

  /** Puts a driver forward. Creates no Driver row until Darb approves. */
  submitDriver: (body: {
    name: string;
    phone: string;
    vehicleType: string;
    zone?: string | null;
    hireDate?: string | null;
    documents?: FleetDocumentInput[];
  }) => post<{ request: FleetChangeRequest; documents: FleetDocument[] }>(
    "/api/fleet/drivers",
    body,
  ),

  requestDriverStatus: (id: string, body: { status: string; reason?: string }) =>
    post<FleetChangeRequest>(`/api/fleet/drivers/${id}/requests`, {
      type: "DRIVER_STATUS",
      ...body,
    }),
  requestDriverProfile: (
    id: string,
    body: { name?: string; vehicleType?: string; zone?: string },
  ) =>
    post<FleetChangeRequest>(`/api/fleet/drivers/${id}/requests`, {
      type: "DRIVER_PROFILE",
      ...body,
    }),
  /**
   * The document type travels as `documentType`, not `type`: `type` on this
   * endpoint names the KIND of request. Collapsing the two would have made
   * every driver document arrive labelled "DRIVER_DOCUMENT".
   */
  requestDriverDocument: (id: string, body: FleetDocumentInput) =>
    post<{ request: FleetChangeRequest; document: FleetDocument }>(
      `/api/fleet/drivers/${id}/requests`,
      {
        type: "DRIVER_DOCUMENT",
        documentType: body.type,
        fileKey: body.fileKey ?? null,
        fileName: body.fileName ?? null,
        mimeType: body.mimeType ?? null,
        sizeBytes: body.sizeBytes ?? null,
        expiryDate: body.expiryDate ?? null,
      },
    ),

  /**
   * The one direct write in this portal. Drivers change SIMs constantly and a
   * review queue between a driver and their own number strands them.
   */
  updatePhone: (id: string, phone: string) =>
    patch<{ id: string; name: string; phone: string }>(
      `/api/fleet/drivers/${id}/phone`,
      { phone },
    ),

  requests: (params?: { status?: string }) =>
    get<FleetChangeRequest[]>("/api/fleet/requests", params as Params),
  withdrawRequest: (id: string) => post<{ ok: true }>(`/api/fleet/requests/${id}/withdraw`),

  issues: (params?: { includeResolved?: boolean }) =>
    get<{ issues: FleetIssue[]; openCount: number }>("/api/fleet/issues", params as Params),
  acknowledgeIssue: (id: string) => post<{ ok: true }>(`/api/fleet/issues/${id}/acknowledge`),
  resolveIssue: (id: string, note: string) =>
    post<{ ok: true }>(`/api/fleet/issues/${id}/resolve`, { note }),

  support: () => get<SupportTicket[]>("/api/fleet/support"),
  createTicket: (body: { subject: string; body: string; type?: SupportTicketType }) =>
    post<SupportTicket>("/api/fleet/support", body),
  replyTicket: (id: string, body: string) =>
    post<SupportTicket>(`/api/fleet/support/${id}/reply`, { body }),
  cancelTicket: (id: string) => post<{ ok: true }>(`/api/fleet/support/${id}/cancel`),
};

/**
 * Upload a file straight to R2 and return what the caller should send back to
 * Darb. The bytes never touch the API: it signs a PUT and the browser does the
 * transfer. Throws a sentence, not an axios error, so every caller can just
 * show `err.message`.
 */
export async function uploadFleetDocument(
  type: string,
  file: File,
): Promise<FleetDocumentInput> {
  let signed: { url: string; key: string };
  try {
    signed = await fleetApi.documentUploadUrl({
      type,
      contentType: file.type,
      fileName: file.name,
    });
  } catch (err) {
    const e = err as { response?: { data?: { error?: string; code?: string } } };
    throw new Error(
      e?.response?.data?.error ?? "Could not start the upload. Contact Darb operations.",
    );
  }

  // Straight to the bucket. Needs a CORS rule on the bucket allowing PUT from
  // the portal origin; the mobile app never hit that because React Native does
  // not enforce CORS, and a browser does.
  const res = await fetch(signed.url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!res.ok) throw new Error("The file did not upload. Try again.");

  return {
    type,
    fileKey: signed.key,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  };
}

// ── /api/fleets (staff scope) ────────────────────────────────────────────

export const fleetsApi = {
  list: (params?: Params) =>
    get<Paginated<FleetProfile> | FleetProfile[]>("/api/fleets", params),
  getById: (id: string) => get<FleetProfile>(`/api/fleets/${id}`),
  scorecard: (id: string, params?: { from?: string; to?: string }) =>
    get<FleetScorecard>(`/api/fleets/${id}/scorecard`, params as Params),
  statements: (id: string) => get<FleetStatementRow[]>(`/api/fleets/${id}/statements`),
  users: (id: string) => get<FleetUser[]>(`/api/fleets/${id}/users`),
  /**
   * Staff set the password and hand it over: fleet logins have no invite flow.
   * Both this and the list above are ADMIN-only on the server.
   */
  createUser: (
    id: string,
    body: { name: string; email: string; password: string; phone?: string }
  ) => post<FleetUser>(`/api/fleets/${id}/users`, body),

  // ── Revision 12: reviewing what the delivery companies submit ──────────

  pendingCount: () =>
    get<{ pendingRequests: number; escalatedIssues: number }>(
      "/api/fleets/requests/pending-count",
    ),
  requests: (id: string, params?: { status?: string }) =>
    get<FleetChangeRequest[]>(`/api/fleets/${id}/requests`, params as Params),
  approveRequest: (id: string, reqId: string, note?: string) =>
    post<{ ok: true; driverId: string | null; created: boolean }>(
      `/api/fleets/${id}/requests/${reqId}/approve`,
      { note },
    ),
  rejectRequest: (id: string, reqId: string, reason: string) =>
    post<{ ok: true }>(`/api/fleets/${id}/requests/${reqId}/reject`, { reason }),
  documents: (id: string) => get<FleetDocument[]>(`/api/fleets/${id}/documents`),
  documentUrl: (docId: string) => get<{ url: string }>(`/api/fleets/documents/${docId}/url`),
  issues: (id: string, params?: { includeResolved?: boolean }) =>
    get<FleetIssue[]>(`/api/fleets/${id}/issues`, params as Params),
  support: (id: string) => get<SupportTicket[]>(`/api/fleets/${id}/support`),
  replySupport: (id: string, ticketId: string, body: string, resolve?: boolean) =>
    post<SupportTicket>(`/api/fleets/${id}/support/${ticketId}/reply`, { body, resolve }),
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
