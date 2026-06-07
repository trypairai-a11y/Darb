export interface DriverFileCompany {
  id: string;
  name: string;
  platform: string;
}

export interface DriverFileSupervisor {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface DriverFileProfile {
  id: string;
  name: string;
  civilIdMasked: string | null;
  civilIdStatus: string | null;
  civilIdExpiry: string | null;
  photoUrl: string | null;
  status: string;
  platform: string;
  platformDriverId: string | null;
  phone: string;
  vehicleType: string;
  company: DriverFileCompany | null;
  supervisor: DriverFileSupervisor | null;
  zone: string | null;
  batchNumber: string | null;
  hireDate: string | null;
  monthlySalary: number | null;
  performanceTier: string | null;
}

export interface DriverFileLiveDevice {
  id: string;
  model: string;
  osVersion: string;
  agentVersion: string | null;
  batteryLevel: number | null;
  status: string;
  isOnline: boolean;
  lastSeen: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface DriverFileLiveStatus {
  onlineNow: boolean;
  lastSeenAt: string | null;
  activeShift: { id: string; startsAt: string | null; area: string | null } | null;
  area: string | null;
  device: DriverFileLiveDevice | null;
}

export interface DriverFileScore {
  compositeScore: number;
  attendanceScore: number;
  deliveryScore: number;
  financialScore: number;
  equipmentScore: number;
  platformScore: number;
  trend: "UP" | "DOWN" | "STABLE";
  date: string | null;
}

export interface DriverFileScoreExplanation {
  text: string;
  cached: boolean;
}

export interface DriverFileSnapshot {
  snapshotDate: string;
  compositeScore: number;
  attendanceScore: number;
  deliveryScore: number;
  financialScore: number;
  equipmentScore: number;
  platformScore: number;
  ordersCount: number;
  shiftsCount: number;
  violationsCount: number;
  cashOutstandingKd: number;
}

export interface DriverFileAttendance {
  last14Days: Array<{ id: string; date: string; status: string; lateMinutes: number | null }>;
  lateCount: number;
  absentCount: number;
}

export interface DriverFileShift {
  id: string;
  date: string;
  platform: string;
  zone: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  status: string;
  plannedHoursMinutes: number | null;
  actualHoursMinutes: number | null;
  deliveryArea: string | null;
}

export interface DriverFileOrder {
  id: string;
  date: string;
  platform: string;
  orderCount: number;
  cashCollected: number;
  tips: number;
  totalAmount: number;
  restaurantName: string | null;
  arrivalTime: string | null;
  orderNumber: string | null;
  paymentSource: string | null;
  source: string;
}

export interface DriverFileOrders {
  todayCount: number;
  todayCash: number;
  weekCount: number;
  weekCash: number;
  recent: DriverFileOrder[];
}

export interface DriverFileCash {
  outstanding: number;
  records: Array<{
    id: string;
    date: string;
    salesAmount: number;
    collectionAmount: number;
    pendingDues: number;
    status: string;
  }>;
}

export interface DriverFileViolations {
  items: Array<{
    id: string;
    violationType: string;
    violationStatus: string;
    appealStatus: string | null;
    violationTime: string;
    details: string | null;
  }>;
  penalties: Array<{
    id: string;
    penaltyType: string;
    penaltyStatus: string;
    penaltyValue: string | null;
    createdAt: string;
  }>;
  appeals: Array<{
    id: string;
    appealLevel: number;
    appealStatus: string;
    channel: string | null;
    reason: string | null;
    rejectionNote: string | null;
    appealedAt: string;
    reviewedAt: string | null;
    violation: { id: string; violationType: string; violationTime: string };
  }>;
  restrictions: Array<{
    id: string;
    type: string;
    startDate: string;
    endDate: string | null;
    reason: string | null;
    processedAt: string | null;
    active: boolean;
  }>;
}

export interface DriverFileDocument {
  key: string;
  label: string;
  status: string | null;
  expiry: string | null;
}

export interface DriverFileAssets {
  vehicle: {
    id: string;
    plateNumber: string;
    vehicleType: string;
    make: string;
    model: string;
    year: number;
    color: string | null;
    mileage: number;
    status: string;
    insuranceExpiry: string | null;
    registrationExpiry: string | null;
  } | null;
  device: (DriverFileLiveDevice & { imei: string }) | null;
  sim: { id: string; phoneNumber: string; carrier: string | null; status: string } | null;
  inventory: Array<{
    id: string;
    itemType: string;
    issued: boolean;
    quantity: number;
    issuedDate: string | null;
    returnedDate: string | null;
  }>;
  inspections: Array<{
    id: string;
    date: string;
    status: string;
    notes: string | null;
    deductionApplied: boolean;
  }>;
  maintenance: Array<{
    id: string;
    category: string;
    type: string;
    cost: number;
    vendor: string | null;
    status: string;
    createdAt: string;
  }>;
}

export interface DriverFileTicket {
  id: string;
  ticketNumber: string;
  category: string;
  priority: string;
  title: string;
  status: string;
  createdAt: string;
  slaDeadline: string | null;
}

export interface DriverFileAgentNotes {
  proposals: Array<{ id: string; toolName: string; reasoning: string; createdAt: string }>;
  observations: Array<{ id: string; key: string; value: unknown; createdAt: string }>;
  audit: Array<{ id: string; toolName: string; reasoning: string; createdAt: string }>;
}

export interface DriverFileAuditEntry {
  id: string;
  toolName: string;
  proposer: string;
  outcome?: string;
  reasoning: string;
  createdAt: string;
}

export interface DriverFileBatchChange {
  id: string;
  batchNumber: string | null;
  changedAt: string;
  changedBy: string | null;
}

export interface DriverFileData {
  profile: DriverFileProfile;
  batchHistory: DriverFileBatchChange[];
  liveStatus: DriverFileLiveStatus;
  score: DriverFileScore | null;
  scoreExplanation: DriverFileScoreExplanation;
  snapshots90d: DriverFileSnapshot[];
  attendance: DriverFileAttendance;
  shifts: { recent: DriverFileShift[] };
  orders: DriverFileOrders;
  cash: DriverFileCash;
  violations: DriverFileViolations;
  documents: DriverFileDocument[];
  assets: DriverFileAssets;
  tickets: DriverFileTicket[];
  agentNotes: DriverFileAgentNotes;
  decisionAuditLog: {
    approved: DriverFileAuditEntry[];
    pending: DriverFileAuditEntry[];
  };
}
