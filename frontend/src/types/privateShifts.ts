// Revision 24 (#8 to #11) — private shifts. Mirrors
// backend/src/services/privateShifts/privateShiftService.ts (serializeShift,
// getPrivateShiftDetail, getVendorVehiclePlans, getFleetVehicleRates).

export type VehicleType = "MOTORCYCLE" | "CAR";
export const VEHICLE_TYPES: VehicleType[] = ["MOTORCYCLE", "CAR"];

export type PrivateShiftStatus = "PROPOSED" | "OPEN" | "BOOKED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

interface Named {
  id: string;
  name: string;
  nameAr?: string | null;
}

export interface PrivateShift {
  id: string;
  planId: string | null;
  vendorId: string;
  branchId: string;
  vehicleType: VehicleType;
  date: string;
  startAt: string;
  endAt: string;
  status: PrivateShiftStatus;
  source: "ADMIN" | "VENDOR";
  driverId: string | null;
  fleetPartnerId: string | null;
  bookedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  scheduledMinutes: number | null;
  lateDeductionMinutes: number | null;
  awayDeductionMinutes: number | null;
  billableMinutes: number | null;
  vendorHourlyKwd: string | null;
  fleetHourlyKwd: string | null;
  vendorChargeKwd: string | null;
  fleetPayKwd: string | null;
  settledAt: string | null;
  vendor: Named | null;
  branch: Named | null;
  driver: { id: string; name: string; driverCode: string | null; phone: string | null } | null;
  fleetPartner: Named | null;
}

export type DeductionKind = "LATE_START" | "LATE_ORDER" | "AWAY" | "EARLY_END";

export interface PrivateShiftDeduction {
  kind: DeductionKind;
  minutes: number;
  orderId: string | null;
  fromAt: string | null;
  toAt: string | null;
}

export interface PrivateShiftDetail extends PrivateShift {
  deductions: Array<PrivateShiftDeduction & { id: string }>;
  /** Before the shift is settled: the running figures. */
  preview: {
    scheduledMinutes: number;
    lateStartMinutes: number;
    lateOrderMinutes: number;
    awayMinutes: number;
    earlyEndMinutes: number;
    deductedMinutes: number;
    billableMinutes: number;
    vendorHourlyKwd: string | null;
    fleetHourlyKwd: string | null;
    vendorChargeKwd: string | null;
    fleetPayKwd: string | null;
    deductions: PrivateShiftDeduction[];
  } | null;
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    assignedAt: string | null;
    deliveredAt: string | null;
    slaDeadline: string | null;
  }>;
  kpis: { delivered: number; onTime: number; onTimeRate: number | null };
}

export interface PrivateShiftDraft {
  id: string;
  vendorId: string;
  branchId: string;
  date: string;
  vehicleType: VehicleType;
  requestedShifts: number;
  source: "ADMIN" | "VENDOR";
  createdAt: string;
}

export interface PrivateShiftList {
  data: PrivateShift[];
  drafts: PrivateShiftDraft[];
}

export interface PrivateShiftPlan {
  id: string;
  vendorId: string;
  branchId: string;
  vehicleType: VehicleType;
  date: string;
  requestedShifts: number;
  shiftHours: number;
  source: "ADMIN" | "VENDOR";
  status: "DRAFT" | "CONFIRMED" | "CANCELLED";
  basis: {
    hourly?: number[];
    ordersSampled?: number;
    sameWeekday?: boolean;
    lookbackWeeks?: number;
    usedDefaultProfile?: boolean;
  } | null;
  shifts: PrivateShift[];
}

export interface VendorVehiclePlans {
  vehicleTypes: VehicleType[];
  suitableVehicleTypes: VehicleType[];
  defaultDeliveryPlanId: string | null;
  plans: Array<{ vehicleType: VehicleType; deliveryPlanId: string | null; perHourKwd: string | null }>;
}

export interface FleetVehicleRates {
  vehicleTypes: VehicleType[];
  commercialModel: string;
  baseFeePerOrderKwd: string | null;
  perKmFeeKwd: string | null;
  rates: Array<{ vehicleType: VehicleType; perOrderKwd: string | null; perHourKwd: string | null }>;
  /** Fleet portal only. */
  canPropose?: boolean;
  pending?: {
    id: string;
    kind: "VEHICLE_RATES" | "BASE_RATE";
    vehicleRates: Array<{ vehicleType: VehicleType; perOrderKwd: string | null; perHourKwd: string | null }> | null;
    reason: string | null;
    createdAt: string;
  } | null;
}

/** "HH:mm" in Kuwait for an instant, and the hours a shift runs. */
export function kuwaitClock(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function shiftHours(s: { startAt: string; endAt: string }): number {
  return Math.round((new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 3_600_000);
}

/** Today's date in Kuwait, YYYY-MM-DD. */
export function kuwaitToday(offsetDays = 0): string {
  return new Date(Date.now() + 3 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}
