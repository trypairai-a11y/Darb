/**
 * Revision 24 (#11) — private shifts in the driver app. Mirrors
 * backend/src/routes/agentPrivateShifts.ts.
 *
 * "For the driver, it is optional to book the normal shift or book a private
 * shift." Only drivers Darb has cleared see open ones, and only for their own
 * vehicle type; the server enforces both.
 */
import { agentFetch } from "./client";

export type PrivateShiftStatus = "PROPOSED" | "OPEN" | "BOOKED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface DriverPrivateShift {
  id: string;
  date: string;
  startAt: string;
  endAt: string;
  status: PrivateShiftStatus;
  vehicleType: "MOTORCYCLE" | "CAR";
  vendor: { id: string; name: string; nameAr?: string | null } | null;
  branch: { id: string; name: string; nameAr?: string | null } | null;
  billableMinutes: number | null;
  scheduledMinutes: number | null;
}

export interface PrivateShiftsResponse {
  eligible: boolean;
  open: DriverPrivateShift[];
  mine: DriverPrivateShift[];
}

export type LiveState = "AT_VENDOR" | "ON_ORDER" | "RETURNING" | "AWAY" | "UNKNOWN";

export interface CurrentPrivateShift {
  shift:
    | (DriverPrivateShift & {
        branchLocation: { lat: number; lng: number; address: string | null } | null;
        canStartAt: string;
        radiusM: number;
      })
    | null;
  live?: {
    state: LiveState;
    returnByAt: string | null;
    distanceM: number | null;
    deductedMinutes: number;
    awayMinutes: number;
    lateOrderMinutes: number;
    lateStartMinutes: number;
  } | null;
}

export async function fetchPrivateShifts(): Promise<PrivateShiftsResponse> {
  const res = await agentFetch<PrivateShiftsResponse>("/api/agent/private-shifts");
  return { eligible: !!res.eligible, open: res.open ?? [], mine: res.mine ?? [] };
}

export async function fetchCurrentPrivateShift(): Promise<CurrentPrivateShift> {
  return agentFetch<CurrentPrivateShift>("/api/agent/private-shifts/current");
}

export async function bookPrivateShift(id: string): Promise<void> {
  await agentFetch(`/api/agent/private-shifts/${id}/book`, { method: "POST", body: "{}" });
}

export async function releasePrivateShift(id: string): Promise<void> {
  await agentFetch(`/api/agent/private-shifts/${id}/release`, { method: "POST", body: "{}" });
}

/** 409 NOT_AT_VENDOR carries { distanceM, radiusM } on the ApiError body. */
export async function startPrivateShift(
  id: string,
  where: { latitude: number; longitude: number } | null,
): Promise<{ ok: boolean; warning?: string }> {
  return agentFetch(`/api/agent/private-shifts/${id}/start`, {
    method: "POST",
    body: JSON.stringify(where ?? {}),
  });
}

export async function endPrivateShift(id: string): Promise<{ billableMinutes: number; deductedMinutes: number }> {
  return agentFetch(`/api/agent/private-shifts/${id}/end`, { method: "POST", body: "{}" });
}

/** "19:00" in Kuwait for an instant (UTC+3, no daylight saving). */
export function kuwaitClock(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
