// Revision 24 (#8 to #10) — private shifts, vehicle plans and vehicle rates.
//
// Kept in its own file so this feature is one import, not edits spread through
// darbApi.ts. Same shared axios instance, and the same admin-inspection rule:
// a portal path carries the ?vendorId / ?fleetPartnerId the URL is scoped to.
import api from "@/lib/api";
import type {
  FleetVehicleRates,
  PrivateShift,
  PrivateShiftDetail,
  PrivateShiftList,
  PrivateShiftPlan,
  VehicleType,
  VendorVehiclePlans,
} from "@/types/privateShifts";

type Params = Record<string, string | number | undefined | null>;

function scoped(url: string, params?: Params): Record<string, string | number> | undefined {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null && v !== "") out[k] = v;
  if (typeof window !== "undefined") {
    const key = url.startsWith("/api/vendor/") ? "vendorId" : url.startsWith("/api/fleet/") ? "fleetPartnerId" : null;
    const id = key ? new URLSearchParams(window.location.search).get(key) : null;
    if (key && id) out[key] = id;
  }
  return Object.keys(out).length ? out : undefined;
}

async function get<T>(url: string, params?: Params): Promise<T> {
  const { data } = await api.get<T>(url, { params: scoped(url, params) });
  return data;
}
async function send<T>(method: "post" | "put" | "patch", url: string, body?: unknown): Promise<T> {
  const { data } = await api[method]<T>(url, body ?? {}, { params: scoped(url) });
  return data;
}

export interface NewPlanInput {
  vendorId?: string;
  branchId: string;
  vehicleType: VehicleType;
  date: string;
  count: number;
  hours: number;
}

export interface PlanShiftInput {
  startTime: string;
  hours: number;
}

/** Staff: /api/private-shifts. */
export const privateShiftsApi = {
  list: (params: { from?: string; to?: string; vendorId?: string; status?: string }) =>
    get<PrivateShiftList>("/api/private-shifts", params),
  detail: (id: string) => get<PrivateShiftDetail>(`/api/private-shifts/${id}`),
  createPlan: (body: NewPlanInput) => send<PrivateShiftPlan>("post", "/api/private-shifts/plans", body),
  plan: (id: string) => get<PrivateShiftPlan>(`/api/private-shifts/plans/${id}`),
  savePlan: (id: string, shifts: PlanShiftInput[]) =>
    send<PrivateShiftPlan>("put", `/api/private-shifts/plans/${id}/shifts`, { shifts }),
  confirmPlan: (id: string) => send<PrivateShiftPlan>("post", `/api/private-shifts/plans/${id}/confirm`),
  discardPlan: (id: string) => send<{ ok: boolean }>("post", `/api/private-shifts/plans/${id}/discard`),
  cancel: (id: string, reason?: string) => send<{ ok: boolean }>("post", `/api/private-shifts/${id}/cancel`, { reason }),
  vendorPlans: (vendorId: string) =>
    get<VendorVehiclePlans>(`/api/private-shifts/vendors/${vendorId}/vehicle-plans`),
  saveVendorPlans: (
    vendorId: string,
    body: {
      suitableVehicleTypes: VehicleType[];
      plans: Array<{ vehicleType: VehicleType; deliveryPlanId: string | null; perHourKwd: string | null }>;
    },
  ) => send<VendorVehiclePlans>("put", `/api/private-shifts/vendors/${vendorId}/vehicle-plans`, body),
  fleetRates: (fleetId: string) => get<FleetVehicleRates>(`/api/private-shifts/fleets/${fleetId}/vehicle-rates`),
  saveFleetRates: (
    fleetId: string,
    rates: Array<{ vehicleType: VehicleType; perOrderKwd: string | null; perHourKwd: string | null }>,
  ) => send<FleetVehicleRates>("put", `/api/private-shifts/fleets/${fleetId}/vehicle-rates`, { rates }),
  driverEligibility: (driverId: string) =>
    get<{ driverId: string; privateShiftEligible: boolean; vehicleType: VehicleType }>(
      `/api/private-shifts/drivers/${driverId}/eligibility`,
    ),
  setDriverEligibility: (driverId: string, eligible: boolean) =>
    send<{ driverId: string; privateShiftEligible: boolean }>(
      "patch",
      `/api/private-shifts/drivers/${driverId}/eligibility`,
      { eligible },
    ),
};

/** Merchant portal: /api/vendor/private-shifts. */
export const vendorPrivateShiftsApi = {
  list: (params: { from?: string; to?: string; branchId?: string }) =>
    get<PrivateShiftList & {
      suitableVehicleTypes: VehicleType[];
      hourlyRates: Array<{ vehicleType: VehicleType; perHourKwd: string | null }>;
    }>("/api/vendor/private-shifts", params),
  detail: (id: string) => get<PrivateShiftDetail>(`/api/vendor/private-shifts/${id}`),
  createPlan: (body: Omit<NewPlanInput, "vendorId">) =>
    send<PrivateShiftPlan>("post", "/api/vendor/private-shifts/plans", body),
  plan: (id: string) => get<PrivateShiftPlan>(`/api/vendor/private-shifts/plans/${id}`),
  savePlan: (id: string, shifts: PlanShiftInput[]) =>
    send<PrivateShiftPlan>("put", `/api/vendor/private-shifts/plans/${id}/shifts`, { shifts }),
  confirmPlan: (id: string) => send<PrivateShiftPlan>("post", `/api/vendor/private-shifts/plans/${id}/confirm`),
  discardPlan: (id: string) => send<{ ok: boolean }>("post", `/api/vendor/private-shifts/plans/${id}/discard`),
  cancel: (id: string) => send<{ ok: boolean }>("post", `/api/vendor/private-shifts/${id}/cancel`, {}),
};

/** Fleet portal: /api/fleet. */
export const fleetPrivateShiftsApi = {
  vehicleRates: () => get<FleetVehicleRates>("/api/fleet/vehicle-rates"),
  proposeVehicleRates: (body: {
    rates: Array<{ vehicleType: VehicleType; perOrderKwd: string | null; perHourKwd: string | null }>;
    reason?: string;
    documents: unknown[];
  }) => send<{ id: string; status: string }>("post", "/api/fleet/vehicle-rates", body),
  list: (params: { from?: string; to?: string }) =>
    get<{ data: PrivateShift[] }>("/api/fleet/private-shifts", params),
  detail: (id: string) => get<PrivateShiftDetail>(`/api/fleet/private-shifts/${id}`),
};
