import type { Violation } from "@/types/api";

const MOCK_DRIVERS: { id: string; name: string; platformDriverId: string; vehicleType: string }[] = [
  { id: "drv_amk_001", name: "Mohammed Al-Rashidi", platformDriverId: "AMK-1042", vehicleType: "Bike" },
  { id: "drv_amk_002", name: "Yousef Al-Mutairi", platformDriverId: "AMK-1058", vehicleType: "Bike" },
  { id: "drv_amk_003", name: "Ahmed Hassan", platformDriverId: "AMK-1071", vehicleType: "Car" },
  { id: "drv_amk_004", name: "Salem Al-Ajmi", platformDriverId: "AMK-1083", vehicleType: "Bike" },
  { id: "drv_amk_005", name: "Khaled Al-Otaibi", platformDriverId: "AMK-1097", vehicleType: "Car" },
  { id: "drv_amk_006", name: "Fahad Al-Dosari", platformDriverId: "AMK-1104", vehicleType: "Bike" },
  { id: "drv_amk_007", name: "Bader Al-Shemmari", platformDriverId: "AMK-1118", vehicleType: "Bike" },
  { id: "drv_amk_008", name: "Naser Al-Enezi", platformDriverId: "AMK-1126", vehicleType: "Car" },
  { id: "drv_amk_009", name: "Hamad Al-Khaldi", platformDriverId: "AMK-1133", vehicleType: "Bike" },
  { id: "drv_amk_010", name: "Abdullah Al-Sabah", platformDriverId: "AMK-1147", vehicleType: "Bike" },
  { id: "drv_amk_011", name: "Meshal Al-Hajri", platformDriverId: "AMK-1159", vehicleType: "Car" },
  { id: "drv_amk_012", name: "Talal Al-Qahtani", platformDriverId: "AMK-1163", vehicleType: "Bike" },
  { id: "drv_amk_013", name: "Saad Al-Roumi", platformDriverId: "AMK-1178", vehicleType: "Bike" },
  { id: "drv_amk_014", name: "Waleed Al-Fadhli", platformDriverId: "AMK-1184", vehicleType: "Car" },
  { id: "drv_amk_015", name: "Jaber Al-Subaie", platformDriverId: "AMK-1192", vehicleType: "Bike" },
];

type MockSpec = {
  driverIdx: number;
  type: "AMERICANA_LATE_ARRIVAL" | "AMERICANA_NO_SHOW" | "AMERICANA_EARLY_DEPARTURE_QUIT";
  status: "ESTABLISHED" | "UNDER_REVIEW" | "OVERTURNED" | "EXPIRED";
  appeal: "NOT_RAISED" | "PENDING" | "APPROVED" | "REJECTED";
  hoursAgo: number;
  taskSuffix: string;
  details: string;
  branch: string;
};

const SPECS: MockSpec[] = [
  { driverIdx: 0, type: "AMERICANA_LATE_ARRIVAL",          status: "ESTABLISHED",  appeal: "NOT_RAISED", hoursAgo: 2,    taskSuffix: "TF-3201", details: "Driver arrived 14 minutes after scheduled shift start at TGI Fridays — Avenues.", branch: "TGI Fridays — Avenues" },
  { driverIdx: 1, type: "AMERICANA_NO_SHOW",               status: "ESTABLISHED",  appeal: "PENDING",    hoursAgo: 4,    taskSuffix: "KFC-8842", details: "Driver did not log in to KFC — Hawally throughout the assigned 16:00–22:00 shift.", branch: "KFC — Hawally" },
  { driverIdx: 2, type: "AMERICANA_EARLY_DEPARTURE_QUIT",  status: "UNDER_REVIEW", appeal: "PENDING",    hoursAgo: 6,    taskSuffix: "PIZ-2234", details: "Driver clocked out 47 minutes before shift end at Pizza Hut — Salmiya.", branch: "Pizza Hut — Salmiya" },
  { driverIdx: 3, type: "AMERICANA_LATE_ARRIVAL",          status: "OVERTURNED",   appeal: "APPROVED",   hoursAgo: 8,    taskSuffix: "TF-3289", details: "Late arrival overturned — supervisor confirmed schedule swap with Bader Al-Shemmari.", branch: "TGI Fridays — Salem Al-Mubarak" },
  { driverIdx: 4, type: "AMERICANA_LATE_ARRIVAL",          status: "ESTABLISHED",  appeal: "NOT_RAISED", hoursAgo: 10,   taskSuffix: "KRP-5612", details: "Driver arrived 22 minutes late to Krispy Kreme — 360 Mall.", branch: "Krispy Kreme — 360 Mall" },
  { driverIdx: 5, type: "AMERICANA_NO_SHOW",               status: "ESTABLISHED",  appeal: "REJECTED",   hoursAgo: 14,   taskSuffix: "KFC-8901", details: "No-show appeal rejected — sick leave was not pre-approved through HR.", branch: "KFC — Jabriya" },
  { driverIdx: 6, type: "AMERICANA_LATE_ARRIVAL",          status: "ESTABLISHED",  appeal: "NOT_RAISED", hoursAgo: 22,   taskSuffix: "PIZ-2298", details: "Driver arrived 9 minutes after scheduled start — second occurrence this week.", branch: "Pizza Hut — Mahboula" },
  { driverIdx: 7, type: "AMERICANA_EARLY_DEPARTURE_QUIT",  status: "ESTABLISHED",  appeal: "PENDING",    hoursAgo: 26,   taskSuffix: "TF-3315", details: "Driver left shift 1h 12m early citing vehicle issue — pending verification.", branch: "TGI Fridays — Avenues" },
  { driverIdx: 8, type: "AMERICANA_NO_SHOW",               status: "EXPIRED",      appeal: "NOT_RAISED", hoursAgo: 32,   taskSuffix: "KRP-5634", details: "Appeal window expired — violation auto-finalised after 24h.", branch: "Krispy Kreme — Avenues" },
  { driverIdx: 9, type: "AMERICANA_LATE_ARRIVAL",          status: "OVERTURNED",   appeal: "APPROVED",   hoursAgo: 40,   taskSuffix: "TF-3344", details: "Overturned by supervisor — Avenues parking gate outage delayed 6 drivers.", branch: "TGI Fridays — Avenues" },
  { driverIdx: 10, type: "AMERICANA_EARLY_DEPARTURE_QUIT", status: "UNDER_REVIEW", appeal: "PENDING",    hoursAgo: 48,   taskSuffix: "PIZ-2342", details: "Driver clocked out 35 minutes early — claims unsafe weather conditions.", branch: "Pizza Hut — Fahaheel" },
  { driverIdx: 11, type: "AMERICANA_LATE_ARRIVAL",         status: "ESTABLISHED",  appeal: "NOT_RAISED", hoursAgo: 56,   taskSuffix: "KFC-8967", details: "Driver arrived 18 minutes late — repeated violation, escalation flagged.", branch: "KFC — Salmiya" },
  { driverIdx: 12, type: "AMERICANA_NO_SHOW",              status: "ESTABLISHED",  appeal: "NOT_RAISED", hoursAgo: 62,   taskSuffix: "TF-3378", details: "Driver did not show for the 11:00–17:00 lunch shift; phone unreachable.", branch: "TGI Fridays — 360 Mall" },
  { driverIdx: 13, type: "AMERICANA_LATE_ARRIVAL",         status: "OVERTURNED",   appeal: "APPROVED",   hoursAgo: 72,   taskSuffix: "KRP-5667", details: "Overturned — driver provided ER paperwork for family emergency.", branch: "Krispy Kreme — 360 Mall" },
  { driverIdx: 14, type: "AMERICANA_EARLY_DEPARTURE_QUIT", status: "ESTABLISHED",  appeal: "REJECTED",   hoursAgo: 80,   taskSuffix: "PIZ-2401", details: "Early departure appeal rejected — no documented operational justification.", branch: "Pizza Hut — Hawally" },
  { driverIdx: 0, type: "AMERICANA_LATE_ARRIVAL",          status: "ESTABLISHED",  appeal: "NOT_RAISED", hoursAgo: 96,   taskSuffix: "TF-3422", details: "Late arrival — 11 minutes after scheduled shift start.", branch: "TGI Fridays — Avenues" },
  { driverIdx: 5, type: "AMERICANA_NO_SHOW",               status: "EXPIRED",      appeal: "NOT_RAISED", hoursAgo: 120,  taskSuffix: "KFC-9015", details: "Appeal window expired with no submission.", branch: "KFC — Jabriya" },
  { driverIdx: 9, type: "AMERICANA_EARLY_DEPARTURE_QUIT",  status: "ESTABLISHED",  appeal: "PENDING",    hoursAgo: 144,  taskSuffix: "KRP-5703", details: "Clocked out 28 minutes early — driver claims order assignment ended.", branch: "Krispy Kreme — Avenues" },
];

function makeId(prefix: string, n: number) {
  return `${prefix}_${String(n).padStart(8, "0")}`;
}

function buildViolation(spec: MockSpec, idx: number, now: Date): Violation {
  const driver = MOCK_DRIVERS[spec.driverIdx];
  const violationTime = new Date(now.getTime() - spec.hoursAgo * 60 * 60 * 1000).toISOString();

  const appealLevel1 = spec.appeal === "NOT_RAISED" ? "NOT_RAISED" : spec.appeal;
  const appeals =
    spec.appeal === "NOT_RAISED"
      ? []
      : [
          {
            id: makeId("apl", idx + 1),
            violationId: makeId("vio", idx + 1),
            appealLevel: 1,
            appealStatus: spec.appeal,
            channel: spec.appeal === "REJECTED" ? "EMAIL" : "APP",
            reason:
              spec.appeal === "REJECTED"
                ? "Driver requested review citing personal reasons."
                : spec.appeal === "APPROVED"
                ? "Supervisor verified mitigating circumstance and approved appeal."
                : "Driver submitted explanation; awaiting supervisor review.",
            rejectionNote:
              spec.appeal === "REJECTED"
                ? "Reason did not meet Americana DA8 override criteria."
                : null,
            appealedAt: new Date(
              new Date(violationTime).getTime() + 90 * 60 * 1000
            ).toISOString(),
            reviewedAt:
              spec.appeal === "PENDING"
                ? null
                : new Date(
                    new Date(violationTime).getTime() + 6 * 60 * 60 * 1000
                  ).toISOString(),
          },
        ];

  return {
    id: makeId("vio", idx + 1),
    driverId: driver.id,
    platform: "AMERICANA",
    violationType: spec.type,
    violationStatus: spec.status,
    appealStatus: appealLevel1,
    firstAppealStatus: appealLevel1,
    secondAppealStatus: "NOT_RAISED",
    violationTime,
    details: spec.details,
    taskId: makeId("tsk", idx + 1) + `_${spec.taskSuffix}`,
    metadata: { branch: spec.branch, settlementMode: "MONTHLY" },
    driver: {
      id: driver.id,
      name: driver.name,
      platformDriverId: driver.platformDriverId,
      vehicleType: driver.vehicleType,
    },
    penalties:
      spec.status === "ESTABLISHED"
        ? [
            {
              id: makeId("pen", idx + 1),
              driverId: driver.id,
              penaltyType:
                spec.type === "AMERICANA_NO_SHOW"
                  ? "ACCOUNT_SUSPENSION"
                  : spec.type === "AMERICANA_EARLY_DEPARTURE_QUIT"
                  ? "VIOLATION_RECORD"
                  : "WARNING",
              penaltyStatus: "EFFECTIVE",
              penaltyValue:
                spec.type === "AMERICANA_NO_SHOW"
                  ? "1 day"
                  : spec.type === "AMERICANA_EARLY_DEPARTURE_QUIT"
                  ? "5 KD"
                  : "Warning",
              createdAt: violationTime,
            },
          ]
        : [],
    appeals,
  } as Violation;
}

export function getMockAmericanaViolations(now: Date = new Date()): Violation[] {
  return SPECS.map((s, i) => buildViolation(s, i, now));
}

export function getMockAmericanaSummary(now: Date = new Date()) {
  const list = getMockAmericanaViolations(now);
  const byType = new Map<string, number>();
  const byStatus = new Map<string, number>();
  for (const v of list) {
    byType.set(v.violationType, (byType.get(v.violationType) || 0) + 1);
    byStatus.set(v.violationStatus, (byStatus.get(v.violationStatus) || 0) + 1);
  }
  return {
    total: list.length,
    pendingAppeals: list.filter((v) => v.appealStatus === "PENDING").length,
    byType: Array.from(byType, ([type, count]) => ({ type, count })),
    byStatus: Array.from(byStatus, ([status, count]) => ({ status, count })),
  };
}

export function filterMockAmericanaViolations(
  list: Violation[],
  opts: {
    violationType?: string;
    violationStatus?: string;
    appealStatus?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Violation[] {
  let out = list;
  if (opts.violationType) out = out.filter((v) => v.violationType === opts.violationType);
  if (opts.violationStatus) out = out.filter((v) => v.violationStatus === opts.violationStatus);
  if (opts.appealStatus) out = out.filter((v) => v.appealStatus === opts.appealStatus);
  if (opts.search) {
    const q = opts.search.toLowerCase();
    out = out.filter((v) =>
      (v.driver?.name || "").toLowerCase().includes(q) ||
      (v.driver?.platformDriverId || "").toLowerCase().includes(q)
    );
  }
  if (opts.dateFrom) {
    const from = new Date(opts.dateFrom).getTime();
    out = out.filter((v) => new Date(v.violationTime).getTime() >= from);
  }
  if (opts.dateTo) {
    const to = new Date(opts.dateTo).getTime() + 24 * 60 * 60 * 1000 - 1;
    out = out.filter((v) => new Date(v.violationTime).getTime() <= to);
  }
  return out;
}
