
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.TenantScalarFieldEnum = {
  id: 'id',
  name: 'name',
  subscriptionPlan: 'subscriptionPlan',
  designPartner: 'designPartner',
  monthlyOverrideKd: 'monthlyOverrideKd',
  trialEndsAt: 'trialEndsAt',
  defaultLanguage: 'defaultLanguage',
  outboundChannels: 'outboundChannels',
  whatsappBusinessAccountId: 'whatsappBusinessAccountId',
  whatsappPhoneNumberId: 'whatsappPhoneNumberId',
  outboundDailyKdLimit: 'outboundDailyKdLimit',
  settings: 'settings',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CompanyScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  platform: 'platform',
  licenseCount: 'licenseCount',
  isActive: 'isActive',
  kind: 'kind',
  ownerGroupId: 'ownerGroupId',
  accountManagerId: 'accountManagerId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OwnerGroupScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  contactName: 'contactName',
  contactPhone: 'contactPhone',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  email: 'email',
  phone: 'phone',
  passwordHash: 'passwordHash',
  name: 'name',
  role: 'role',
  isSuperAdmin: 'isSuperAdmin',
  jobGrade: 'jobGrade',
  vendorId: 'vendorId',
  fleetPartnerId: 'fleetPartnerId',
  ownerGroupId: 'ownerGroupId',
  branchId: 'branchId',
  vendorRole: 'vendorRole',
  isActive: 'isActive',
  lastLoginAt: 'lastLoginAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DriverScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  companyId: 'companyId',
  name: 'name',
  phone: 'phone',
  driverCode: 'driverCode',
  platform: 'platform',
  platformDriverId: 'platformDriverId',
  utr: 'utr',
  vehicleType: 'vehicleType',
  zone: 'zone',
  batchNumber: 'batchNumber',
  status: 'status',
  hireDate: 'hireDate',
  photoUrl: 'photoUrl',
  supervisorId: 'supervisorId',
  preferredLanguage: 'preferredLanguage',
  outboundOptIn: 'outboundOptIn',
  smsOptOut: 'smsOptOut',
  expoPushToken: 'expoPushToken',
  monthlySalary: 'monthlySalary',
  monthlyOffDaysUsed: 'monthlyOffDaysUsed',
  offDaysResetMonth: 'offDaysResetMonth',
  performanceTier: 'performanceTier',
  tierComputedAt: 'tierComputedAt',
  throttledUntil: 'throttledUntil',
  fleetPartnerId: 'fleetPartnerId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  healthCertExpiry: 'healthCertExpiry',
  healthCertStatus: 'healthCertStatus',
  workPermitExpiry: 'workPermitExpiry',
  workPermitStatus: 'workPermitStatus',
  foodHandlingCertExpiry: 'foodHandlingCertExpiry',
  foodHandlingCertStatus: 'foodHandlingCertStatus',
  vehicleRegExpiry: 'vehicleRegExpiry',
  vehicleRegStatus: 'vehicleRegStatus',
  vehicleInsuranceExpiry: 'vehicleInsuranceExpiry',
  vehicleInsuranceStatus: 'vehicleInsuranceStatus',
  drivingLicenseExpiry: 'drivingLicenseExpiry',
  drivingLicenseStatus: 'drivingLicenseStatus',
  civilIdExpiry: 'civilIdExpiry',
  civilIdStatus: 'civilIdStatus'
};

exports.Prisma.DriverRestrictionScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  type: 'type',
  startDate: 'startDate',
  endDate: 'endDate',
  reason: 'reason',
  processedAt: 'processedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DriverInventoryScalarFieldEnum = {
  id: 'id',
  driverId: 'driverId',
  itemType: 'itemType',
  issued: 'issued',
  quantity: 'quantity',
  issuedDate: 'issuedDate',
  returnedDate: 'returnedDate',
  condition: 'condition',
  conditionNote: 'conditionNote',
  conditionReportedAt: 'conditionReportedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RecruitmentPipelineScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  candidateName: 'candidateName',
  phone: 'phone',
  stage: 'stage',
  agency: 'agency',
  expectedDate: 'expectedDate',
  notes: 'notes',
  assignedCompanyId: 'assignedCompanyId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VehicleScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  companyId: 'companyId',
  plateNumber: 'plateNumber',
  vehicleType: 'vehicleType',
  make: 'make',
  model: 'model',
  year: 'year',
  color: 'color',
  chassisNumber: 'chassisNumber',
  mileage: 'mileage',
  fuelType: 'fuelType',
  ownerCompany: 'ownerCompany',
  driverIqama: 'driverIqama',
  status: 'status',
  assignedDriverId: 'assignedDriverId',
  insuranceExpiry: 'insuranceExpiry',
  registrationExpiry: 'registrationExpiry',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VehicleDriverAssignmentScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  vehicleId: 'vehicleId',
  driverId: 'driverId',
  assignedAt: 'assignedAt',
  unassignedAt: 'unassignedAt',
  active: 'active',
  note: 'note',
  createdAt: 'createdAt'
};

exports.Prisma.ShiftScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  date: 'date',
  platform: 'platform',
  zone: 'zone',
  scheduledStart: 'scheduledStart',
  scheduledEnd: 'scheduledEnd',
  actualStart: 'actualStart',
  actualEnd: 'actualEnd',
  platformClockIn: 'platformClockIn',
  platformClockOut: 'platformClockOut',
  varianceMinutes: 'varianceMinutes',
  status: 'status',
  isValid: 'isValid',
  plannedHoursMinutes: 'plannedHoursMinutes',
  actualHoursMinutes: 'actualHoursMinutes',
  selfieUrl: 'selfieUrl',
  selfieLocation: 'selfieLocation',
  clockInMethod: 'clockInMethod',
  clockOutMethod: 'clockOutMethod',
  shiftScreenshotUrl: 'shiftScreenshotUrl',
  deliveryArea: 'deliveryArea',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AttendanceRecordScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  shiftId: 'shiftId',
  date: 'date',
  status: 'status',
  lateMinutes: 'lateMinutes',
  source: 'source',
  darbClockIn: 'darbClockIn',
  darbClockOut: 'darbClockOut',
  platformClockIn: 'platformClockIn',
  platformClockOut: 'platformClockOut',
  varianceMinutes: 'varianceMinutes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OrderLogScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  shiftId: 'shiftId',
  date: 'date',
  platform: 'platform',
  orderCount: 'orderCount',
  distanceKm: 'distanceKm',
  cashCollected: 'cashCollected',
  tips: 'tips',
  totalAmount: 'totalAmount',
  orderNumber: 'orderNumber',
  paymentSource: 'paymentSource',
  restaurantName: 'restaurantName',
  arrivalTime: 'arrivalTime',
  screenshotUrl: 'screenshotUrl',
  source: 'source',
  rawData: 'rawData',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CashRecordScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  date: 'date',
  salesAmount: 'salesAmount',
  collectionAmount: 'collectionAmount',
  depositMethod: 'depositMethod',
  depositReceiptUrl: 'depositReceiptUrl',
  pendingDues: 'pendingDues',
  status: 'status',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CashTransactionScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  date: 'date',
  type: 'type',
  amount: 'amount',
  orderNumber: 'orderNumber',
  description: 'description',
  runningBalance: 'runningBalance',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PendingDuesLedgerScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  month: 'month',
  openingBalance: 'openingBalance',
  totalSales: 'totalSales',
  totalCollection: 'totalCollection',
  cashDeposits: 'cashDeposits',
  bankTransfers: 'bankTransfers',
  incentives: 'incentives',
  adjustments: 'adjustments',
  closingBalance: 'closingBalance',
  dailySales: 'dailySales',
  dailyCollections: 'dailyCollections',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VehicleInspectionScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  vehicleId: 'vehicleId',
  driverId: 'driverId',
  date: 'date',
  status: 'status',
  photos: 'photos',
  notes: 'notes',
  deductionApplied: 'deductionApplied',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MaintenanceRecordScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  vehicleId: 'vehicleId',
  driverId: 'driverId',
  category: 'category',
  type: 'type',
  cost: 'cost',
  vendor: 'vendor',
  receiptUrl: 'receiptUrl',
  spareVehicleId: 'spareVehicleId',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DeviceScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  imei: 'imei',
  model: 'model',
  osVersion: 'osVersion',
  agentVersion: 'agentVersion',
  lastSeen: 'lastSeen',
  batteryLevel: 'batteryLevel',
  isOnline: 'isOnline',
  status: 'status',
  lastLatitude: 'lastLatitude',
  lastLongitude: 'lastLongitude',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SimScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  phoneNumber: 'phoneNumber',
  carrier: 'carrier',
  status: 'status',
  driverId: 'driverId',
  deviceId: 'deviceId',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CapturedOrderScalarFieldEnum = {
  id: 'id',
  deviceId: 'deviceId',
  driverId: 'driverId',
  platform: 'platform',
  notificationText: 'notificationText',
  parsedData: 'parsedData',
  capturedAt: 'capturedAt'
};

exports.Prisma.LocationLogScalarFieldEnum = {
  id: 'id',
  deviceId: 'deviceId',
  driverId: 'driverId',
  latitude: 'latitude',
  longitude: 'longitude',
  accuracy: 'accuracy',
  speed: 'speed',
  capturedAt: 'capturedAt'
};

exports.Prisma.AppUsageLogScalarFieldEnum = {
  id: 'id',
  deviceId: 'deviceId',
  driverId: 'driverId',
  appPackage: 'appPackage',
  eventType: 'eventType',
  durationSeconds: 'durationSeconds',
  capturedAt: 'capturedAt'
};

exports.Prisma.DeviceCommandScalarFieldEnum = {
  id: 'id',
  deviceId: 'deviceId',
  command: 'command',
  payload: 'payload',
  status: 'status',
  issuedById: 'issuedById',
  issuedAt: 'issuedAt',
  acknowledgedAt: 'acknowledgedAt'
};

exports.Prisma.AiScoreScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  date: 'date',
  compositeScore: 'compositeScore',
  attendanceScore: 'attendanceScore',
  deliveryScore: 'deliveryScore',
  financialScore: 'financialScore',
  equipmentScore: 'equipmentScore',
  platformScore: 'platformScore',
  breakdown: 'breakdown',
  trend: 'trend',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AlertScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  type: 'type',
  severity: 'severity',
  title: 'title',
  message: 'message',
  driverId: 'driverId',
  vehicleId: 'vehicleId',
  data: 'data',
  status: 'status',
  acknowledgedById: 'acknowledgedById',
  acknowledgedAt: 'acknowledgedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AiDigestScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  date: 'date',
  content: 'content',
  generatedAt: 'generatedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  action: 'action',
  entityType: 'entityType',
  entityId: 'entityId',
  changes: 'changes',
  ipAddress: 'ipAddress',
  createdAt: 'createdAt'
};

exports.Prisma.TicketScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  ticketNumber: 'ticketNumber',
  category: 'category',
  priority: 'priority',
  title: 'title',
  description: 'description',
  submitterType: 'submitterType',
  submitterDriverId: 'submitterDriverId',
  submitterUserId: 'submitterUserId',
  assignedToId: 'assignedToId',
  status: 'status',
  photos: 'photos',
  resolution: 'resolution',
  resolvedAt: 'resolvedAt',
  slaDeadline: 'slaDeadline',
  platform: 'platform',
  companyId: 'companyId',
  driverId: 'driverId',
  vehicleId: 'vehicleId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LeaveRequestScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  type: 'type',
  startDate: 'startDate',
  endDate: 'endDate',
  reason: 'reason',
  status: 'status',
  reviewedById: 'reviewedById',
  reviewedAt: 'reviewedAt',
  reviewNotes: 'reviewNotes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TalabatSessionScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  shiftId: 'shiftId',
  date: 'date',
  zone: 'zone',
  vehicleType: 'vehicleType',
  sessionCode: 'sessionCode',
  plannedStart: 'plannedStart',
  plannedEnd: 'plannedEnd',
  approvedStart: 'approvedStart',
  approvedEnd: 'approvedEnd',
  actualStart: 'actualStart',
  actualEnd: 'actualEnd',
  plannedHours: 'plannedHours',
  approvedHours: 'approvedHours',
  actualHours: 'actualHours',
  deliveries: 'deliveries',
  cashCollected: 'cashCollected',
  tips: 'tips',
  distanceKm: 'distanceKm',
  status: 'status',
  faceVerified: 'faceVerified',
  equipmentVerified: 'equipmentVerified',
  gpsViolation: 'gpsViolation',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TalabatViolationEventScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  sessionId: 'sessionId',
  type: 'type',
  description: 'description',
  metadata: 'metadata',
  resolved: 'resolved',
  resolvedAt: 'resolvedAt',
  resolvedBy: 'resolvedBy',
  createdAt: 'createdAt'
};

exports.Prisma.TalabatDeliveryScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  sessionId: 'sessionId',
  date: 'date',
  platformOrderId: 'platformOrderId',
  shortCode: 'shortCode',
  finishedAt: 'finishedAt',
  orderType: 'orderType',
  amount: 'amount',
  tip: 'tip',
  distanceKm: 'distanceKm',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.KeetaDailyMetricsScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  date: 'date',
  courierPlatformId: 'courierPlatformId',
  supervisorName: 'supervisorName',
  vehicleType: 'vehicleType',
  onShift: 'onShift',
  validDay: 'validDay',
  onlineTime: 'onlineTime',
  validOnlineTime: 'validOnlineTime',
  peakOnlineMinutes: 'peakOnlineMinutes',
  acceptedTasks: 'acceptedTasks',
  restaurantArrivals: 'restaurantArrivals',
  deliveredTasks: 'deliveredTasks',
  largeOrdersCompleted: 'largeOrdersCompleted',
  cancelledTasks: 'cancelledTasks',
  rejectedTasks: 'rejectedTasks',
  rejectedByCourier: 'rejectedByCourier',
  rejectedAuto: 'rejectedAuto',
  cancellationRate: 'cancellationRate',
  completionRate: 'completionRate',
  onTimeRate: 'onTimeRate',
  largeOrderOnTimeRate: 'largeOrderOnTimeRate',
  avgDeliveryMinutes: 'avgDeliveryMinutes',
  over55minProportion: 'over55minProportion',
  overdueOrders: 'overdueOrders',
  severelyOverdue: 'severelyOverdue',
  source: 'source',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.IngestRunScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  platform: 'platform',
  source: 'source',
  status: 'status',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt',
  rowsIn: 'rowsIn',
  rowsOk: 'rowsOk',
  errorLog: 'errorLog'
};

exports.Prisma.DeliverooDailyMetricsScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  shiftDate: 'shiftDate',
  codCollectedKwd: 'codCollectedKwd',
  tipsKwd: 'tipsKwd',
  deliveriesCount: 'deliveriesCount',
  unassignedCount: 'unassignedCount',
  hourlyBuckets: 'hourlyBuckets',
  source: 'source',
  status: 'status',
  rawImageUrl: 'rawImageUrl',
  ocrConfidence: 'ocrConfidence',
  ocrRaw: 'ocrRaw',
  reviewedBy: 'reviewedBy',
  reviewedAt: 'reviewedAt',
  reviewNote: 'reviewNote',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TalabatDailyMetricsScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  shiftDate: 'shiftDate',
  utr: 'utr',
  ordersCompleted: 'ordersCompleted',
  onlineHours: 'onlineHours',
  earnings: 'earnings',
  source: 'source',
  status: 'status',
  rawImageUrl: 'rawImageUrl',
  ocrConfidence: 'ocrConfidence',
  ocrRaw: 'ocrRaw',
  reviewedBy: 'reviewedBy',
  reviewedAt: 'reviewedAt',
  reviewNote: 'reviewNote',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PlatformSettingsScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  platform: 'platform',
  targets: 'targets',
  kpis: 'kpis',
  shiftRules: 'shiftRules',
  zones: 'zones',
  violationRules: 'violationRules',
  cashRules: 'cashRules',
  bookingRules: 'bookingRules',
  documentRules: 'documentRules',
  notificationConfig: 'notificationConfig',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PlatformInventoryScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  platform: 'platform',
  itemType: 'itemType',
  total: 'total',
  issued: 'issued',
  available: 'available',
  minStock: 'minStock',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AmericanaDailyOrdersScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  month: 'month',
  chain: 'chain',
  chainId: 'chainId',
  empId: 'empId',
  storeName: 'storeName',
  storeId: 'storeId',
  company: 'company',
  position: 'position',
  dailyOrders: 'dailyOrders',
  totalOrders: 'totalOrders',
  source: 'source',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AmericanaChainScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  slug: 'slug',
  logoUrl: 'logoUrl',
  active: 'active',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AmericanaStoreScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  chainId: 'chainId',
  name: 'name',
  area: 'area',
  managerName: 'managerName',
  managerPhone: 'managerPhone',
  backupContactName: 'backupContactName',
  backupContactPhone: 'backupContactPhone',
  notes: 'notes',
  active: 'active',
  carDailyTarget: 'carDailyTarget',
  bikeDailyTarget: 'bikeDailyTarget',
  carMonthlyTarget: 'carMonthlyTarget',
  bikeMonthlyTarget: 'bikeMonthlyTarget',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AmericanaContractScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  contractRef: 'contractRef',
  signedDate: 'signedDate',
  effectiveFrom: 'effectiveFrom',
  effectiveTo: 'effectiveTo',
  originalFileUrl: 'originalFileUrl',
  ocrStatus: 'ocrStatus',
  ocrExtractedAt: 'ocrExtractedAt',
  ocrConfidence: 'ocrConfidence',
  ocrDraftRates: 'ocrDraftRates',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AmericanaChainRateScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  chainId: 'chainId',
  vehicleType: 'vehicleType',
  ratePerOrder: 'ratePerOrder',
  effectiveFrom: 'effectiveFrom',
  effectiveTo: 'effectiveTo',
  contractId: 'contractId',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DriverBatchHistoryScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  batchNumber: 'batchNumber',
  changedAt: 'changedAt',
  changedBy: 'changedBy',
  note: 'note'
};

exports.Prisma.AmericanaStoreAssignmentScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  storeId: 'storeId',
  month: 'month',
  startDate: 'startDate',
  endDate: 'endDate',
  vehicleType: 'vehicleType',
  reasonForChange: 'reasonForChange',
  previousAssignmentId: 'previousAssignmentId',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AmericanaDailyIngestionScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  source: 'source',
  emailMessageId: 'emailMessageId',
  rawFileUrl: 'rawFileUrl',
  capturedAt: 'capturedAt',
  ingestDate: 'ingestDate',
  status: 'status',
  parsedRows: 'parsedRows',
  rowCount: 'rowCount',
  errorLog: 'errorLog',
  approvedBy: 'approvedBy',
  approvedAt: 'approvedAt',
  rejectedReason: 'rejectedReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.KpiDefinitionScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  description: 'description',
  category: 'category',
  unit: 'unit',
  platform: 'platform',
  target: 'target',
  isActive: 'isActive',
  sortOrder: 'sortOrder',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.KpiRecordScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  kpiDefinitionId: 'kpiDefinitionId',
  date: 'date',
  value: 'value',
  target: 'target',
  score: 'score',
  source: 'source',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  title: 'title',
  message: 'message',
  type: 'type',
  severity: 'severity',
  sourceId: 'sourceId',
  metadata: 'metadata',
  read: 'read',
  readAt: 'readAt',
  category: 'category',
  titleAr: 'titleAr',
  bodyAr: 'bodyAr',
  createdAt: 'createdAt'
};

exports.Prisma.NotificationDeliveryScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  channel: 'channel',
  recipient: 'recipient',
  subject: 'subject',
  body: 'body',
  provider: 'provider',
  status: 'status',
  idempotencyKey: 'idempotencyKey',
  error: 'error',
  attempts: 'attempts',
  lastAttemptAt: 'lastAttemptAt',
  sentAt: 'sentAt',
  sourceType: 'sourceType',
  sourceId: 'sourceId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.NotificationRuleScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  eventType: 'eventType',
  role: 'role',
  enabled: 'enabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CourierOnlineSessionScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  startTime: 'startTime',
  endTime: 'endTime',
  isOnline: 'isOnline',
  availability: 'availability',
  lastGpsAt: 'lastGpsAt',
  lastGpsLat: 'lastGpsLat',
  lastGpsLng: 'lastGpsLng',
  area: 'area',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ViolationScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  platform: 'platform',
  violationType: 'violationType',
  violationStatus: 'violationStatus',
  appealStatus: 'appealStatus',
  firstAppealStatus: 'firstAppealStatus',
  secondAppealStatus: 'secondAppealStatus',
  violationTime: 'violationTime',
  details: 'details',
  metadata: 'metadata',
  taskId: 'taskId',
  overrideReason: 'overrideReason',
  overriddenBy: 'overriddenBy',
  overriddenAt: 'overriddenAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PenaltyScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  penaltyType: 'penaltyType',
  penaltyStatus: 'penaltyStatus',
  penaltyValue: 'penaltyValue',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AppealScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  violationId: 'violationId',
  appealLevel: 'appealLevel',
  appealStatus: 'appealStatus',
  channel: 'channel',
  reason: 'reason',
  rejectionNote: 'rejectionNote',
  appealedAt: 'appealedAt',
  reviewedAt: 'reviewedAt',
  reviewedBy: 'reviewedBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OrderEventScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  orderId: 'orderId',
  action: 'action',
  description: 'description',
  operator: 'operator',
  operatorId: 'operatorId',
  timestamp: 'timestamp',
  metadata: 'metadata',
  createdAt: 'createdAt'
};

exports.Prisma.AiInsightScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  category: 'category',
  subcategory: 'subcategory',
  context: 'context',
  severity: 'severity',
  title: 'title',
  description: 'description',
  actionLabel: 'actionLabel',
  actionHref: 'actionHref',
  data: 'data',
  driverId: 'driverId',
  platform: 'platform',
  score: 'score',
  expiresAt: 'expiresAt',
  batchId: 'batchId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DemandHeatmapScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  platform: 'platform',
  zone: 'zone',
  dayOfWeek: 'dayOfWeek',
  hourSlot: 'hourSlot',
  avgOrders: 'avgOrders',
  topRestaurants: 'topRestaurants',
  confidence: 'confidence',
  updatedAt: 'updatedAt'
};

exports.Prisma.DeliveryAreaScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  nameAr: 'nameAr',
  active: 'active',
  createdAt: 'createdAt'
};

exports.Prisma.CourierAttendanceSlotScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  date: 'date',
  slotStart: 'slotStart',
  slotEnd: 'slotEnd',
  status: 'status',
  onShiftMin: 'onShiftMin',
  createdAt: 'createdAt'
};

exports.Prisma.KeetaAvailableShiftSlotScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  platform: 'platform',
  date: 'date',
  area: 'area',
  slotStart: 'slotStart',
  slotEnd: 'slotEnd',
  capacity: 'capacity',
  claimed: 'claimed',
  vehicleType: 'vehicleType',
  branchId: 'branchId',
  branchName: 'branchName',
  source: 'source',
  externalId: 'externalId',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ShiftComplianceConfigScalarFieldEnum = {
  tenantId: 'tenantId',
  underShiftHours: 'underShiftHours',
  evaluateCron: 'evaluateCron',
  updatedAt: 'updatedAt'
};

exports.Prisma.PartnerScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  groupId: 'groupId',
  groupName: 'groupName',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PartnerBankAccountScalarFieldEnum = {
  id: 'id',
  partnerId: 'partnerId',
  bankName: 'bankName',
  accountName: 'accountName',
  tailNumber: 'tailNumber',
  verified: 'verified',
  createdAt: 'createdAt'
};

exports.Prisma.IncentiveTargetRoundScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  partnerId: 'partnerId',
  period: 'period',
  vehicleType: 'vehicleType',
  issuedAt: 'issuedAt',
  initialTarget: 'initialTarget',
  adjustedTarget: 'adjustedTarget',
  status: 'status',
  operator: 'operator',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.IncentiveGoalScalarFieldEnum = {
  id: 'id',
  roundId: 'roundId',
  name: 'name',
  weight: 'weight',
  targetValue: 'targetValue',
  minThreshold: 'minThreshold'
};

exports.Prisma.IncentiveTierScalarFieldEnum = {
  id: 'id',
  roundId: 'roundId',
  kind: 'kind',
  level: 'level',
  minRate: 'minRate',
  maxRate: 'maxRate',
  payment: 'payment'
};

exports.Prisma.CourierIncentivePayoutScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  roundId: 'roundId',
  driverId: 'driverId',
  experienceRate: 'experienceRate',
  experienceTier: 'experienceTier',
  experiencePayKwd: 'experiencePayKwd',
  validDaCount: 'validDaCount',
  validDaTier: 'validDaTier',
  validDaPayKwd: 'validDaPayKwd',
  totalPayKwd: 'totalPayKwd',
  computedAt: 'computedAt'
};

exports.Prisma.BillingScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  partnerId: 'partnerId',
  groupId: 'groupId',
  groupName: 'groupName',
  billingId: 'billingId',
  billType: 'billType',
  period: 'period',
  billingDate: 'billingDate',
  invoiceAmount: 'invoiceAmount',
  payableAmount: 'payableAmount',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TaxInvoiceScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  billingId: 'billingId',
  invoiceNo: 'invoiceNo',
  issueDate: 'issueDate',
  sellerName: 'sellerName',
  totalAmount: 'totalAmount',
  fileUrl: 'fileUrl',
  status: 'status',
  rejectReason: 'rejectReason',
  submittedAt: 'submittedAt',
  acceptedAt: 'acceptedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PaymentWithdrawalScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  billingId: 'billingId',
  groupId: 'groupId',
  groupName: 'groupName',
  withdrawTime: 'withdrawTime',
  tailNumber: 'tailNumber',
  amountKwd: 'amountKwd',
  status: 'status',
  operationStatus: 'operationStatus',
  note: 'note',
  createdAt: 'createdAt'
};

exports.Prisma.AgentRunLogScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  agentId: 'agentId',
  triggerEvent: 'triggerEvent',
  model: 'model',
  promptTokens: 'promptTokens',
  completionTokens: 'completionTokens',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt',
  status: 'status',
  error: 'error',
  actionsProposed: 'actionsProposed',
  actionsApproved: 'actionsApproved',
  actionsRejected: 'actionsRejected',
  feedback: 'feedback'
};

exports.Prisma.AgentToolCallScalarFieldEnum = {
  id: 'id',
  runId: 'runId',
  toolName: 'toolName',
  input: 'input',
  output: 'output',
  error: 'error',
  durationMs: 'durationMs',
  approvedBy: 'approvedBy',
  executedAt: 'executedAt'
};

exports.Prisma.PendingAgentActionScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  runId: 'runId',
  agentId: 'agentId',
  toolName: 'toolName',
  input: 'input',
  recommendation: 'recommendation',
  confidence: 'confidence',
  reasoning: 'reasoning',
  priorityScore: 'priorityScore',
  subjectType: 'subjectType',
  subjectId: 'subjectId',
  resolvedAt: 'resolvedAt',
  resolution: 'resolution',
  overrideReason: 'overrideReason',
  resolvedBy: 'resolvedBy',
  createdAt: 'createdAt'
};

exports.Prisma.AgentActionScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  proposer: 'proposer',
  approverId: 'approverId',
  toolName: 'toolName',
  originalProposal: 'originalProposal',
  modificationsBeforeApproval: 'modificationsBeforeApproval',
  outcome: 'outcome',
  reasoning: 'reasoning',
  agentRunId: 'agentRunId',
  modelName: 'modelName',
  promptTokens: 'promptTokens',
  completionTokens: 'completionTokens',
  latencyMs: 'latencyMs',
  errorMessage: 'errorMessage',
  subjectType: 'subjectType',
  subjectId: 'subjectId',
  rolledBackAt: 'rolledBackAt',
  rolledBackById: 'rolledBackById',
  rollbackReason: 'rollbackReason',
  source: 'source',
  chatThreadId: 'chatThreadId',
  chatMessageId: 'chatMessageId',
  createdAt: 'createdAt'
};

exports.Prisma.AgentMemoryScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  key: 'key',
  value: 'value',
  confidence: 'confidence',
  source: 'source',
  agentRunId: 'agentRunId',
  createdAt: 'createdAt'
};

exports.Prisma.PinnedViewScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  title: 'title',
  description: 'description',
  viewType: 'viewType',
  spec: 'spec',
  sortOrder: 'sortOrder',
  pinnedAt: 'pinnedAt',
  lastViewedAt: 'lastViewedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  refreshFrequency: 'refreshFrequency',
  sourceThreadId: 'sourceThreadId',
  sourceMessageId: 'sourceMessageId'
};

exports.Prisma.PerformanceSnapshotScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  snapshotDate: 'snapshotDate',
  compositeScore: 'compositeScore',
  attendanceScore: 'attendanceScore',
  deliveryScore: 'deliveryScore',
  financialScore: 'financialScore',
  equipmentScore: 'equipmentScore',
  platformScore: 'platformScore',
  trend: 'trend',
  ordersCount: 'ordersCount',
  shiftsCount: 'shiftsCount',
  violationsCount: 'violationsCount',
  cashOutstandingKd: 'cashOutstandingKd',
  breakdown: 'breakdown',
  computedAt: 'computedAt'
};

exports.Prisma.MetricEventScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  event: 'event',
  properties: 'properties',
  sessionId: 'sessionId',
  createdAt: 'createdAt'
};

exports.Prisma.ChatThreadScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  title: 'title',
  pinned: 'pinned',
  source: 'source',
  briefingId: 'briefingId',
  lastMessageAt: 'lastMessageAt',
  archivedAt: 'archivedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ChatMessageScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  threadId: 'threadId',
  role: 'role',
  content: 'content',
  views: 'views',
  toolCalls: 'toolCalls',
  proposalId: 'proposalId',
  state: 'state',
  promptTokens: 'promptTokens',
  completionTokens: 'completionTokens',
  latencyMs: 'latencyMs',
  modelName: 'modelName',
  errorMessage: 'errorMessage',
  createdAt: 'createdAt'
};

exports.Prisma.ScheduledBriefingScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  name: 'name',
  cron: 'cron',
  prompt: 'prompt',
  recipients: 'recipients',
  channels: 'channels',
  type: 'type',
  active: 'active',
  nextFireAt: 'nextFireAt',
  lastFireAt: 'lastFireAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VendorScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  nameAr: 'nameAr',
  code: 'code',
  phone: 'phone',
  requiresCarOnly: 'requiresCarOnly',
  isPaused: 'isPaused',
  creditCapKwd: 'creditCapKwd',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VendorBranchScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  vendorId: 'vendorId',
  name: 'name',
  nameAr: 'nameAr',
  address: 'address',
  phone: 'phone',
  lat: 'lat',
  lng: 'lng',
  zoneId: 'zoneId',
  foodicsBranchId: 'foodicsBranchId',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DeliveryZoneScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  code: 'code',
  name: 'name',
  nameAr: 'nameAr',
  polygon: 'polygon',
  bbox: 'bbox',
  centroidLat: 'centroidLat',
  centroidLng: 'centroidLng',
  color: 'color',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ZoneSurchargeScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  originZoneId: 'originZoneId',
  destZoneId: 'destZoneId',
  surchargeKwd: 'surchargeKwd',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FulfillmentSettingsScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  intraZoneFeeKwd: 'intraZoneFeeKwd',
  driverCashCeilingKwd: 'driverCashCeilingKwd',
  offerWindowSec: 'offerWindowSec',
  maxOfferRounds: 'maxOfferRounds',
  searchRadiusKm: 'searchRadiusKm',
  gpsStaleAfterSec: 'gpsStaleAfterSec',
  radiusWidenAfterRounds: 'radiusWidenAfterRounds',
  radiusWidenFactor: 'radiusWidenFactor',
  maxSearchRadiusKm: 'maxSearchRadiusKm',
  batchingEnabled: 'batchingEnabled',
  batchMaxDropKm: 'batchMaxDropKm',
  batchMaxOrders: 'batchMaxOrders',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DeliveryOrderScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  orderNumber: 'orderNumber',
  source: 'source',
  foodicsOrderId: 'foodicsOrderId',
  vendorId: 'vendorId',
  branchId: 'branchId',
  status: 'status',
  paymentMethod: 'paymentMethod',
  orderTotalKwd: 'orderTotalKwd',
  deliveryFeeKwd: 'deliveryFeeKwd',
  customerName: 'customerName',
  customerPhone: 'customerPhone',
  dropoffAddress: 'dropoffAddress',
  dropoffLat: 'dropoffLat',
  dropoffLng: 'dropoffLng',
  pickupZoneId: 'pickupZoneId',
  dropoffZoneId: 'dropoffZoneId',
  driverId: 'driverId',
  offerRound: 'offerRound',
  requiresCarOnly: 'requiresCarOnly',
  rejectionReason: 'rejectionReason',
  cancelReason: 'cancelReason',
  failureReason: 'failureReason',
  proofPhotoUrl: 'proofPhotoUrl',
  podPin: 'podPin',
  codCollectedKwd: 'codCollectedKwd',
  slaDeadline: 'slaDeadline',
  scheduledAt: 'scheduledAt',
  returnedAt: 'returnedAt',
  batchId: 'batchId',
  tipKwd: 'tipKwd',
  trackingToken: 'trackingToken',
  externalRef: 'externalRef',
  refundedAt: 'refundedAt',
  assignedAt: 'assignedAt',
  pickedUpAt: 'pickedUpAt',
  deliveredAt: 'deliveredAt',
  cancelledAt: 'cancelledAt',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DispatchOfferScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  orderId: 'orderId',
  driverId: 'driverId',
  round: 'round',
  distanceKm: 'distanceKm',
  batchId: 'batchId',
  status: 'status',
  offeredAt: 'offeredAt',
  expiresAt: 'expiresAt',
  respondedAt: 'respondedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WalletAccountScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  ownerType: 'ownerType',
  ownerKey: 'ownerKey',
  balanceKwd: 'balanceKwd',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WalletTransactionScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  type: 'type',
  idempotencyKey: 'idempotencyKey',
  orderId: 'orderId',
  remittanceId: 'remittanceId',
  memo: 'memo',
  createdById: 'createdById',
  createdAt: 'createdAt'
};

exports.Prisma.WalletEntryScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  transactionId: 'transactionId',
  accountId: 'accountId',
  direction: 'direction',
  amountKwd: 'amountKwd',
  runningBalanceKwd: 'runningBalanceKwd',
  createdAt: 'createdAt'
};

exports.Prisma.RemittanceScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  amountKwd: 'amountKwd',
  method: 'method',
  receiptUrl: 'receiptUrl',
  receivedById: 'receivedById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WalletReconciliationRunScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  runDate: 'runDate',
  status: 'status',
  checks: 'checks',
  createdAt: 'createdAt'
};

exports.Prisma.IncidentScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  type: 'type',
  status: 'status',
  severity: 'severity',
  driverId: 'driverId',
  orderId: 'orderId',
  lat: 'lat',
  lng: 'lng',
  description: 'description',
  reportedVia: 'reportedVia',
  acknowledgedAt: 'acknowledgedAt',
  acknowledgedById: 'acknowledgedById',
  resolvedAt: 'resolvedAt',
  resolvedById: 'resolvedById',
  resolutionNote: 'resolutionNote',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FoodicsConnectionScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  vendorId: 'vendorId',
  accessTokenEnc: 'accessTokenEnc',
  orderTagId: 'orderTagId',
  webhookSecret: 'webhookSecret',
  status: 'status',
  lastEventAt: 'lastEventAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WebhookEventScalarFieldEnum = {
  id: 'id',
  provider: 'provider',
  eventKey: 'eventKey',
  payload: 'payload',
  status: 'status',
  error: 'error',
  processedAt: 'processedAt',
  createdAt: 'createdAt'
};

exports.Prisma.ApiKeyScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  vendorId: 'vendorId',
  name: 'name',
  keyHash: 'keyHash',
  keyPrefix: 'keyPrefix',
  isActive: 'isActive',
  lastUsedAt: 'lastUsedAt',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OrderRatingScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  orderId: 'orderId',
  driverId: 'driverId',
  stars: 'stars',
  comment: 'comment',
  createdAt: 'createdAt'
};

exports.Prisma.VendorStatementScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  vendorId: 'vendorId',
  periodStart: 'periodStart',
  periodEnd: 'periodEnd',
  openingBalanceKwd: 'openingBalanceKwd',
  codNetKwd: 'codNetKwd',
  prepaidFeesKwd: 'prepaidFeesKwd',
  refundsKwd: 'refundsKwd',
  closingBalanceKwd: 'closingBalanceKwd',
  status: 'status',
  payoutTxId: 'payoutTxId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RefundScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  orderId: 'orderId',
  vendorId: 'vendorId',
  amountKwd: 'amountKwd',
  reason: 'reason',
  status: 'status',
  requestedById: 'requestedById',
  processedById: 'processedById',
  walletTxId: 'walletTxId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FleetPartnerScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  contactName: 'contactName',
  contactPhone: 'contactPhone',
  contactEmail: 'contactEmail',
  flatFeePerOrderKwd: 'flatFeePerOrderKwd',
  minOnlineHoursPerDay: 'minOnlineHoursPerDay',
  minDriversOnline: 'minDriversOnline',
  disciplineStatus: 'disciplineStatus',
  disciplineNote: 'disciplineNote',
  isActive: 'isActive',
  ownerGroupId: 'ownerGroupId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FleetPayoutStatementScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  fleetPartnerId: 'fleetPartnerId',
  periodStart: 'periodStart',
  periodEnd: 'periodEnd',
  deliveredOrders: 'deliveredOrders',
  feePerOrderKwd: 'feePerOrderKwd',
  totalKwd: 'totalKwd',
  status: 'status',
  payoutTxId: 'payoutTxId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.TenantOrderByRelevanceFieldEnum = {
  id: 'id',
  name: 'name',
  whatsappBusinessAccountId: 'whatsappBusinessAccountId',
  whatsappPhoneNumberId: 'whatsappPhoneNumberId'
};

exports.Prisma.CompanyOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  kind: 'kind',
  ownerGroupId: 'ownerGroupId',
  accountManagerId: 'accountManagerId'
};

exports.Prisma.OwnerGroupOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  contactName: 'contactName',
  contactPhone: 'contactPhone'
};

exports.Prisma.UserOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  email: 'email',
  phone: 'phone',
  passwordHash: 'passwordHash',
  name: 'name',
  jobGrade: 'jobGrade',
  vendorId: 'vendorId',
  fleetPartnerId: 'fleetPartnerId',
  ownerGroupId: 'ownerGroupId',
  branchId: 'branchId',
  vendorRole: 'vendorRole'
};

exports.Prisma.DriverOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  companyId: 'companyId',
  name: 'name',
  phone: 'phone',
  driverCode: 'driverCode',
  platformDriverId: 'platformDriverId',
  utr: 'utr',
  zone: 'zone',
  batchNumber: 'batchNumber',
  photoUrl: 'photoUrl',
  supervisorId: 'supervisorId',
  expoPushToken: 'expoPushToken',
  offDaysResetMonth: 'offDaysResetMonth',
  performanceTier: 'performanceTier',
  fleetPartnerId: 'fleetPartnerId',
  healthCertStatus: 'healthCertStatus',
  workPermitStatus: 'workPermitStatus',
  foodHandlingCertStatus: 'foodHandlingCertStatus',
  vehicleRegStatus: 'vehicleRegStatus',
  vehicleInsuranceStatus: 'vehicleInsuranceStatus',
  drivingLicenseStatus: 'drivingLicenseStatus',
  civilIdStatus: 'civilIdStatus'
};

exports.Prisma.DriverRestrictionOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  reason: 'reason'
};

exports.Prisma.DriverInventoryOrderByRelevanceFieldEnum = {
  id: 'id',
  driverId: 'driverId',
  conditionNote: 'conditionNote'
};

exports.Prisma.RecruitmentPipelineOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  candidateName: 'candidateName',
  phone: 'phone',
  agency: 'agency',
  notes: 'notes',
  assignedCompanyId: 'assignedCompanyId'
};

exports.Prisma.VehicleOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  companyId: 'companyId',
  plateNumber: 'plateNumber',
  make: 'make',
  model: 'model',
  color: 'color',
  chassisNumber: 'chassisNumber',
  fuelType: 'fuelType',
  ownerCompany: 'ownerCompany',
  driverIqama: 'driverIqama',
  assignedDriverId: 'assignedDriverId'
};

exports.Prisma.VehicleDriverAssignmentOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  vehicleId: 'vehicleId',
  driverId: 'driverId',
  note: 'note'
};

exports.Prisma.ShiftOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  zone: 'zone',
  selfieUrl: 'selfieUrl',
  clockInMethod: 'clockInMethod',
  clockOutMethod: 'clockOutMethod',
  shiftScreenshotUrl: 'shiftScreenshotUrl',
  deliveryArea: 'deliveryArea'
};

exports.Prisma.AttendanceRecordOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  shiftId: 'shiftId',
  source: 'source'
};

exports.Prisma.OrderLogOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  shiftId: 'shiftId',
  orderNumber: 'orderNumber',
  paymentSource: 'paymentSource',
  restaurantName: 'restaurantName',
  screenshotUrl: 'screenshotUrl'
};

exports.Prisma.CashRecordOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  depositReceiptUrl: 'depositReceiptUrl',
  notes: 'notes'
};

exports.Prisma.CashTransactionOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  orderNumber: 'orderNumber',
  description: 'description'
};

exports.Prisma.PendingDuesLedgerOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId'
};

exports.Prisma.VehicleInspectionOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  vehicleId: 'vehicleId',
  driverId: 'driverId',
  notes: 'notes'
};

exports.Prisma.MaintenanceRecordOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  vehicleId: 'vehicleId',
  driverId: 'driverId',
  type: 'type',
  vendor: 'vendor',
  receiptUrl: 'receiptUrl',
  spareVehicleId: 'spareVehicleId'
};

exports.Prisma.DeviceOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  imei: 'imei',
  model: 'model',
  osVersion: 'osVersion',
  agentVersion: 'agentVersion'
};

exports.Prisma.SimOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  phoneNumber: 'phoneNumber',
  carrier: 'carrier',
  driverId: 'driverId',
  deviceId: 'deviceId',
  notes: 'notes'
};

exports.Prisma.CapturedOrderOrderByRelevanceFieldEnum = {
  id: 'id',
  deviceId: 'deviceId',
  driverId: 'driverId',
  notificationText: 'notificationText'
};

exports.Prisma.LocationLogOrderByRelevanceFieldEnum = {
  id: 'id',
  deviceId: 'deviceId',
  driverId: 'driverId'
};

exports.Prisma.AppUsageLogOrderByRelevanceFieldEnum = {
  id: 'id',
  deviceId: 'deviceId',
  driverId: 'driverId',
  appPackage: 'appPackage',
  eventType: 'eventType'
};

exports.Prisma.DeviceCommandOrderByRelevanceFieldEnum = {
  id: 'id',
  deviceId: 'deviceId',
  issuedById: 'issuedById'
};

exports.Prisma.AiScoreOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId'
};

exports.Prisma.AlertOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  type: 'type',
  title: 'title',
  message: 'message',
  driverId: 'driverId',
  vehicleId: 'vehicleId',
  acknowledgedById: 'acknowledgedById'
};

exports.Prisma.AiDigestOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId'
};

exports.Prisma.AuditLogOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  action: 'action',
  entityType: 'entityType',
  entityId: 'entityId',
  ipAddress: 'ipAddress'
};

exports.Prisma.TicketOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  ticketNumber: 'ticketNumber',
  title: 'title',
  description: 'description',
  submitterDriverId: 'submitterDriverId',
  submitterUserId: 'submitterUserId',
  assignedToId: 'assignedToId',
  resolution: 'resolution',
  companyId: 'companyId',
  driverId: 'driverId',
  vehicleId: 'vehicleId'
};

exports.Prisma.LeaveRequestOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  reason: 'reason',
  reviewedById: 'reviewedById',
  reviewNotes: 'reviewNotes'
};

exports.Prisma.TalabatSessionOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  shiftId: 'shiftId',
  zone: 'zone',
  sessionCode: 'sessionCode'
};

exports.Prisma.TalabatViolationEventOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  sessionId: 'sessionId',
  description: 'description',
  resolvedBy: 'resolvedBy'
};

exports.Prisma.TalabatDeliveryOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  sessionId: 'sessionId',
  platformOrderId: 'platformOrderId',
  shortCode: 'shortCode',
  orderType: 'orderType',
  status: 'status'
};

exports.Prisma.KeetaDailyMetricsOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  courierPlatformId: 'courierPlatformId',
  supervisorName: 'supervisorName',
  vehicleType: 'vehicleType',
  source: 'source'
};

exports.Prisma.IngestRunOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  source: 'source',
  status: 'status',
  errorLog: 'errorLog'
};

exports.Prisma.DeliverooDailyMetricsOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  source: 'source',
  status: 'status',
  rawImageUrl: 'rawImageUrl',
  reviewedBy: 'reviewedBy',
  reviewNote: 'reviewNote'
};

exports.Prisma.TalabatDailyMetricsOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  source: 'source',
  status: 'status',
  rawImageUrl: 'rawImageUrl',
  reviewedBy: 'reviewedBy',
  reviewNote: 'reviewNote'
};

exports.Prisma.PlatformSettingsOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId'
};

exports.Prisma.PlatformInventoryOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId'
};

exports.Prisma.AmericanaDailyOrdersOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  chain: 'chain',
  chainId: 'chainId',
  empId: 'empId',
  storeName: 'storeName',
  storeId: 'storeId',
  company: 'company',
  position: 'position',
  source: 'source'
};

exports.Prisma.AmericanaChainOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  slug: 'slug',
  logoUrl: 'logoUrl'
};

exports.Prisma.AmericanaStoreOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  chainId: 'chainId',
  name: 'name',
  area: 'area',
  managerName: 'managerName',
  managerPhone: 'managerPhone',
  backupContactName: 'backupContactName',
  backupContactPhone: 'backupContactPhone',
  notes: 'notes'
};

exports.Prisma.AmericanaContractOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  contractRef: 'contractRef',
  originalFileUrl: 'originalFileUrl',
  ocrStatus: 'ocrStatus',
  notes: 'notes'
};

exports.Prisma.AmericanaChainRateOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  chainId: 'chainId',
  vehicleType: 'vehicleType',
  contractId: 'contractId',
  createdBy: 'createdBy'
};

exports.Prisma.DriverBatchHistoryOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  batchNumber: 'batchNumber',
  changedBy: 'changedBy',
  note: 'note'
};

exports.Prisma.AmericanaStoreAssignmentOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  storeId: 'storeId',
  vehicleType: 'vehicleType',
  reasonForChange: 'reasonForChange',
  previousAssignmentId: 'previousAssignmentId',
  createdBy: 'createdBy'
};

exports.Prisma.AmericanaDailyIngestionOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  source: 'source',
  emailMessageId: 'emailMessageId',
  rawFileUrl: 'rawFileUrl',
  status: 'status',
  errorLog: 'errorLog',
  approvedBy: 'approvedBy',
  rejectedReason: 'rejectedReason'
};

exports.Prisma.KpiDefinitionOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  description: 'description'
};

exports.Prisma.KpiRecordOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  kpiDefinitionId: 'kpiDefinitionId',
  source: 'source'
};

exports.Prisma.NotificationOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  title: 'title',
  message: 'message',
  type: 'type',
  severity: 'severity',
  sourceId: 'sourceId',
  category: 'category',
  titleAr: 'titleAr',
  bodyAr: 'bodyAr'
};

exports.Prisma.NotificationDeliveryOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  recipient: 'recipient',
  subject: 'subject',
  body: 'body',
  provider: 'provider',
  idempotencyKey: 'idempotencyKey',
  error: 'error',
  sourceType: 'sourceType',
  sourceId: 'sourceId'
};

exports.Prisma.NotificationRuleOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  eventType: 'eventType'
};

exports.Prisma.CourierOnlineSessionOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  availability: 'availability',
  area: 'area'
};

exports.Prisma.ViolationOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  details: 'details',
  taskId: 'taskId',
  overrideReason: 'overrideReason',
  overriddenBy: 'overriddenBy'
};

exports.Prisma.PenaltyOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  penaltyType: 'penaltyType',
  penaltyStatus: 'penaltyStatus',
  penaltyValue: 'penaltyValue'
};

exports.Prisma.AppealOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  violationId: 'violationId',
  channel: 'channel',
  reason: 'reason',
  rejectionNote: 'rejectionNote',
  reviewedBy: 'reviewedBy'
};

exports.Prisma.OrderEventOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  orderId: 'orderId',
  action: 'action',
  description: 'description',
  operator: 'operator',
  operatorId: 'operatorId'
};

exports.Prisma.AiInsightOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  category: 'category',
  subcategory: 'subcategory',
  context: 'context',
  severity: 'severity',
  title: 'title',
  description: 'description',
  actionLabel: 'actionLabel',
  actionHref: 'actionHref',
  driverId: 'driverId',
  platform: 'platform',
  batchId: 'batchId'
};

exports.Prisma.DemandHeatmapOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  platform: 'platform',
  zone: 'zone'
};

exports.Prisma.DeliveryAreaOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  nameAr: 'nameAr'
};

exports.Prisma.CourierAttendanceSlotOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  status: 'status'
};

exports.Prisma.KeetaAvailableShiftSlotOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  area: 'area',
  slotStart: 'slotStart',
  slotEnd: 'slotEnd',
  vehicleType: 'vehicleType',
  branchId: 'branchId',
  branchName: 'branchName',
  source: 'source',
  externalId: 'externalId',
  notes: 'notes'
};

exports.Prisma.ShiftComplianceConfigOrderByRelevanceFieldEnum = {
  tenantId: 'tenantId',
  evaluateCron: 'evaluateCron'
};

exports.Prisma.PartnerOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  groupId: 'groupId',
  groupName: 'groupName'
};

exports.Prisma.PartnerBankAccountOrderByRelevanceFieldEnum = {
  id: 'id',
  partnerId: 'partnerId',
  bankName: 'bankName',
  accountName: 'accountName',
  tailNumber: 'tailNumber'
};

exports.Prisma.IncentiveTargetRoundOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  partnerId: 'partnerId',
  period: 'period',
  vehicleType: 'vehicleType',
  status: 'status',
  operator: 'operator'
};

exports.Prisma.IncentiveGoalOrderByRelevanceFieldEnum = {
  id: 'id',
  roundId: 'roundId',
  name: 'name'
};

exports.Prisma.IncentiveTierOrderByRelevanceFieldEnum = {
  id: 'id',
  roundId: 'roundId',
  kind: 'kind',
  level: 'level'
};

exports.Prisma.CourierIncentivePayoutOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  roundId: 'roundId',
  driverId: 'driverId',
  experienceTier: 'experienceTier',
  validDaTier: 'validDaTier'
};

exports.Prisma.BillingOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  partnerId: 'partnerId',
  groupId: 'groupId',
  groupName: 'groupName',
  billingId: 'billingId',
  billType: 'billType',
  period: 'period'
};

exports.Prisma.TaxInvoiceOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  billingId: 'billingId',
  invoiceNo: 'invoiceNo',
  sellerName: 'sellerName',
  fileUrl: 'fileUrl',
  rejectReason: 'rejectReason'
};

exports.Prisma.PaymentWithdrawalOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  billingId: 'billingId',
  groupId: 'groupId',
  groupName: 'groupName',
  tailNumber: 'tailNumber',
  operationStatus: 'operationStatus',
  note: 'note'
};

exports.Prisma.AgentRunLogOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  agentId: 'agentId',
  triggerEvent: 'triggerEvent',
  model: 'model',
  status: 'status',
  error: 'error'
};

exports.Prisma.AgentToolCallOrderByRelevanceFieldEnum = {
  id: 'id',
  runId: 'runId',
  toolName: 'toolName',
  error: 'error',
  approvedBy: 'approvedBy'
};

exports.Prisma.PendingAgentActionOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  runId: 'runId',
  agentId: 'agentId',
  toolName: 'toolName',
  recommendation: 'recommendation',
  reasoning: 'reasoning',
  subjectType: 'subjectType',
  subjectId: 'subjectId',
  resolution: 'resolution',
  overrideReason: 'overrideReason',
  resolvedBy: 'resolvedBy'
};

exports.Prisma.AgentActionOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  proposer: 'proposer',
  approverId: 'approverId',
  toolName: 'toolName',
  outcome: 'outcome',
  reasoning: 'reasoning',
  agentRunId: 'agentRunId',
  modelName: 'modelName',
  errorMessage: 'errorMessage',
  subjectType: 'subjectType',
  subjectId: 'subjectId',
  rolledBackById: 'rolledBackById',
  rollbackReason: 'rollbackReason',
  source: 'source',
  chatThreadId: 'chatThreadId',
  chatMessageId: 'chatMessageId'
};

exports.Prisma.AgentMemoryOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  key: 'key',
  source: 'source',
  agentRunId: 'agentRunId'
};

exports.Prisma.PinnedViewOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  title: 'title',
  description: 'description',
  viewType: 'viewType',
  refreshFrequency: 'refreshFrequency',
  sourceThreadId: 'sourceThreadId',
  sourceMessageId: 'sourceMessageId'
};

exports.Prisma.PerformanceSnapshotOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId'
};

exports.Prisma.MetricEventOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  event: 'event',
  sessionId: 'sessionId'
};

exports.Prisma.ChatThreadOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  title: 'title',
  source: 'source',
  briefingId: 'briefingId'
};

exports.Prisma.ChatMessageOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  threadId: 'threadId',
  role: 'role',
  content: 'content',
  proposalId: 'proposalId',
  state: 'state',
  modelName: 'modelName',
  errorMessage: 'errorMessage'
};

exports.Prisma.ScheduledBriefingOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  name: 'name',
  cron: 'cron',
  prompt: 'prompt',
  type: 'type'
};

exports.Prisma.VendorOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  nameAr: 'nameAr',
  code: 'code',
  phone: 'phone'
};

exports.Prisma.VendorBranchOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  vendorId: 'vendorId',
  name: 'name',
  nameAr: 'nameAr',
  address: 'address',
  phone: 'phone',
  zoneId: 'zoneId',
  foodicsBranchId: 'foodicsBranchId'
};

exports.Prisma.DeliveryZoneOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  code: 'code',
  name: 'name',
  nameAr: 'nameAr',
  color: 'color'
};

exports.Prisma.ZoneSurchargeOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  originZoneId: 'originZoneId',
  destZoneId: 'destZoneId'
};

exports.Prisma.FulfillmentSettingsOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId'
};

exports.Prisma.DeliveryOrderOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  orderNumber: 'orderNumber',
  foodicsOrderId: 'foodicsOrderId',
  vendorId: 'vendorId',
  branchId: 'branchId',
  customerName: 'customerName',
  customerPhone: 'customerPhone',
  dropoffAddress: 'dropoffAddress',
  pickupZoneId: 'pickupZoneId',
  dropoffZoneId: 'dropoffZoneId',
  driverId: 'driverId',
  rejectionReason: 'rejectionReason',
  cancelReason: 'cancelReason',
  failureReason: 'failureReason',
  proofPhotoUrl: 'proofPhotoUrl',
  podPin: 'podPin',
  batchId: 'batchId',
  trackingToken: 'trackingToken',
  externalRef: 'externalRef'
};

exports.Prisma.DispatchOfferOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  orderId: 'orderId',
  driverId: 'driverId',
  batchId: 'batchId'
};

exports.Prisma.WalletAccountOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  ownerKey: 'ownerKey'
};

exports.Prisma.WalletTransactionOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  idempotencyKey: 'idempotencyKey',
  orderId: 'orderId',
  remittanceId: 'remittanceId',
  memo: 'memo',
  createdById: 'createdById'
};

exports.Prisma.WalletEntryOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  transactionId: 'transactionId',
  accountId: 'accountId',
  direction: 'direction'
};

exports.Prisma.RemittanceOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  driverId: 'driverId',
  receiptUrl: 'receiptUrl',
  receivedById: 'receivedById'
};

exports.Prisma.WalletReconciliationRunOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  status: 'status'
};

exports.Prisma.IncidentOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  severity: 'severity',
  driverId: 'driverId',
  orderId: 'orderId',
  description: 'description',
  reportedVia: 'reportedVia',
  acknowledgedById: 'acknowledgedById',
  resolvedById: 'resolvedById',
  resolutionNote: 'resolutionNote'
};

exports.Prisma.FoodicsConnectionOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  vendorId: 'vendorId',
  accessTokenEnc: 'accessTokenEnc',
  orderTagId: 'orderTagId',
  webhookSecret: 'webhookSecret'
};

exports.Prisma.WebhookEventOrderByRelevanceFieldEnum = {
  id: 'id',
  provider: 'provider',
  eventKey: 'eventKey',
  error: 'error'
};

exports.Prisma.ApiKeyOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  vendorId: 'vendorId',
  name: 'name',
  keyHash: 'keyHash',
  keyPrefix: 'keyPrefix',
  createdById: 'createdById'
};

exports.Prisma.OrderRatingOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  orderId: 'orderId',
  driverId: 'driverId',
  comment: 'comment'
};

exports.Prisma.VendorStatementOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  vendorId: 'vendorId',
  status: 'status',
  payoutTxId: 'payoutTxId'
};

exports.Prisma.RefundOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  orderId: 'orderId',
  vendorId: 'vendorId',
  reason: 'reason',
  status: 'status',
  requestedById: 'requestedById',
  processedById: 'processedById',
  walletTxId: 'walletTxId'
};

exports.Prisma.FleetPartnerOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  contactName: 'contactName',
  contactPhone: 'contactPhone',
  contactEmail: 'contactEmail',
  disciplineStatus: 'disciplineStatus',
  disciplineNote: 'disciplineNote',
  ownerGroupId: 'ownerGroupId'
};

exports.Prisma.FleetPayoutStatementOrderByRelevanceFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  fleetPartnerId: 'fleetPartnerId',
  status: 'status',
  payoutTxId: 'payoutTxId'
};
exports.SubscriptionPlan = exports.$Enums.SubscriptionPlan = {
  FREE: 'FREE',
  PRO: 'PRO',
  ENTERPRISE: 'ENTERPRISE'
};

exports.Language = exports.$Enums.Language = {
  EN: 'EN',
  AR: 'AR',
  AUTO: 'AUTO'
};

exports.Platform = exports.$Enums.Platform = {
  KEETA: 'KEETA',
  TALABAT: 'TALABAT',
  DELIVEROO: 'DELIVEROO',
  AMERICANA: 'AMERICANA',
  DARB: 'DARB'
};

exports.UserRole = exports.$Enums.UserRole = {
  ADMIN: 'ADMIN',
  OPS_MANAGER: 'OPS_MANAGER',
  SUPERVISOR: 'SUPERVISOR',
  ACCOUNTANT: 'ACCOUNTANT',
  VIEWER: 'VIEWER',
  VENDOR: 'VENDOR',
  FLEET: 'FLEET'
};

exports.VehicleType = exports.$Enums.VehicleType = {
  MOTORCYCLE: 'MOTORCYCLE',
  CAR: 'CAR'
};

exports.DriverStatus = exports.$Enums.DriverStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
  TERMINATED: 'TERMINATED',
  LEAVE: 'LEAVE',
  TERMINATION: 'TERMINATION',
  RESTRICTED: 'RESTRICTED',
  RESTRICTED_PERMANENTLY: 'RESTRICTED_PERMANENTLY'
};

exports.RestrictionType = exports.$Enums.RestrictionType = {
  TEMPORARY: 'TEMPORARY',
  PERMANENT: 'PERMANENT'
};

exports.InventoryItemType = exports.$Enums.InventoryItemType = {
  HELMET: 'HELMET',
  TSHIRT: 'TSHIRT',
  PANTS: 'PANTS',
  COOLING_VEST: 'COOLING_VEST',
  SAFETY_VEST: 'SAFETY_VEST',
  WATER_BOTTLE: 'WATER_BOTTLE',
  GLOVES: 'GLOVES',
  SAFETY_KIT: 'SAFETY_KIT',
  BIG_BAG: 'BIG_BAG',
  SMALL_BAG: 'SMALL_BAG',
  CAP: 'CAP',
  MOBILE_PHONE: 'MOBILE_PHONE',
  SIM_CARD: 'SIM_CARD',
  PETROL_CARD: 'PETROL_CARD'
};

exports.EquipmentCondition = exports.$Enums.EquipmentCondition = {
  OK: 'OK',
  DAMAGED: 'DAMAGED',
  CHANGED: 'CHANGED',
  CHANGE_REQUESTED: 'CHANGE_REQUESTED'
};

exports.RecruitmentStage = exports.$Enums.RecruitmentStage = {
  AGENCY_REFERRAL: 'AGENCY_REFERRAL',
  CV_DOCS: 'CV_DOCS',
  INTERVIEW: 'INTERVIEW',
  VISA_PROCESSING: 'VISA_PROCESSING',
  FLIGHT_ARRANGEMENT: 'FLIGHT_ARRANGEMENT',
  ARRIVAL: 'ARRIVAL',
  MEDICAL_EXAM: 'MEDICAL_EXAM',
  BANK_CARD: 'BANK_CARD',
  CIVIL_ID: 'CIVIL_ID',
  RESIDENCY: 'RESIDENCY',
  LICENSE_TEST: 'LICENSE_TEST',
  PLATFORM_TRAINING: 'PLATFORM_TRAINING',
  ROAD_SAFETY_TRAINING: 'ROAD_SAFETY_TRAINING',
  FOOD_HANDLING_TRAINING: 'FOOD_HANDLING_TRAINING',
  COMPANY_SOP_TRAINING: 'COMPANY_SOP_TRAINING',
  COMPLETED: 'COMPLETED'
};

exports.VehicleStatus = exports.$Enums.VehicleStatus = {
  ACTIVE: 'ACTIVE',
  MAINTENANCE: 'MAINTENANCE',
  RETIRED: 'RETIRED'
};

exports.ShiftStatus = exports.$Enums.ShiftStatus = {
  BOOKED: 'BOOKED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  MISSED: 'MISSED',
  CANCELLED: 'CANCELLED'
};

exports.AttendanceStatus = exports.$Enums.AttendanceStatus = {
  PRESENT: 'PRESENT',
  LATE: 'LATE',
  ABSENT: 'ABSENT',
  EARLY_LEAVE: 'EARLY_LEAVE',
  EXCUSED: 'EXCUSED',
  OFF: 'OFF',
  DEDUCTION: 'DEDUCTION'
};

exports.OrderSource = exports.$Enums.OrderSource = {
  MANUAL: 'MANUAL',
  SCREENSHOT_OCR: 'SCREENSHOT_OCR',
  EXCEL_IMPORT: 'EXCEL_IMPORT',
  AGENT_CAPTURE: 'AGENT_CAPTURE',
  WHATSAPP: 'WHATSAPP',
  MOBILE_GPS: 'MOBILE_GPS'
};

exports.DepositMethod = exports.$Enums.DepositMethod = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  AL_MUZAINI: 'AL_MUZAINI'
};

exports.CashStatus = exports.$Enums.CashStatus = {
  PENDING: 'PENDING',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  SETTLED: 'SETTLED'
};

exports.CashTransactionType = exports.$Enums.CashTransactionType = {
  COLLECTION: 'COLLECTION',
  CASH_OUT: 'CASH_OUT',
  INVOICE_DEDUCTION: 'INVOICE_DEDUCTION'
};

exports.LedgerStatus = exports.$Enums.LedgerStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED'
};

exports.InspectionStatus = exports.$Enums.InspectionStatus = {
  PASS: 'PASS',
  FAIL: 'FAIL'
};

exports.MaintenanceCategory = exports.$Enums.MaintenanceCategory = {
  SCHEDULED: 'SCHEDULED',
  UNSCHEDULED: 'UNSCHEDULED',
  EMERGENCY: 'EMERGENCY'
};

exports.MaintenanceStatus = exports.$Enums.MaintenanceStatus = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

exports.DeviceStatus = exports.$Enums.DeviceStatus = {
  ACTIVE: 'ACTIVE',
  LOST: 'LOST',
  DECOMMISSIONED: 'DECOMMISSIONED'
};

exports.SimStatus = exports.$Enums.SimStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED'
};

exports.DeviceCommandType = exports.$Enums.DeviceCommandType = {
  LOCK: 'LOCK',
  WIPE: 'WIPE',
  INSTALL_APP: 'INSTALL_APP',
  UNINSTALL_APP: 'UNINSTALL_APP',
  SEND_MESSAGE: 'SEND_MESSAGE',
  ENABLE_KIOSK: 'ENABLE_KIOSK',
  DISABLE_KIOSK: 'DISABLE_KIOSK',
  UPDATE_AGENT: 'UPDATE_AGENT'
};

exports.CommandStatus = exports.$Enums.CommandStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  FAILED: 'FAILED'
};

exports.ScoreTrend = exports.$Enums.ScoreTrend = {
  UP: 'UP',
  DOWN: 'DOWN',
  STABLE: 'STABLE'
};

exports.AlertSeverity = exports.$Enums.AlertSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

exports.AlertStatus = exports.$Enums.AlertStatus = {
  ACTIVE: 'ACTIVE',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  RESOLVED: 'RESOLVED'
};

exports.TicketCategory = exports.$Enums.TicketCategory = {
  VEHICLE_REPAIR: 'VEHICLE_REPAIR',
  EQUIPMENT_REQUEST: 'EQUIPMENT_REQUEST',
  LEAVE_REQUEST: 'LEAVE_REQUEST',
  SALARY_ISSUE: 'SALARY_ISSUE',
  TRANSFER_REQUEST: 'TRANSFER_REQUEST',
  COMPLAINT: 'COMPLAINT',
  ACCIDENT_REPORT: 'ACCIDENT_REPORT',
  OTHER: 'OTHER'
};

exports.TicketPriority = exports.$Enums.TicketPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT'
};

exports.SubmitterType = exports.$Enums.SubmitterType = {
  DRIVER: 'DRIVER',
  USER: 'USER'
};

exports.TicketStatus = exports.$Enums.TicketStatus = {
  OPEN: 'OPEN',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED'
};

exports.LeaveType = exports.$Enums.LeaveType = {
  SICK: 'SICK',
  VACATION: 'VACATION',
  EMERGENCY: 'EMERGENCY',
  PERSONAL: 'PERSONAL'
};

exports.LeaveStatus = exports.$Enums.LeaveStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

exports.TalabatSessionStatus = exports.$Enums.TalabatSessionStatus = {
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW'
};

exports.ViolationEventType = exports.$Enums.ViolationEventType = {
  SELFIE_FAIL: 'SELFIE_FAIL',
  GPS_OFF: 'GPS_OFF',
  EQUIPMENT_MISSING: 'EQUIPMENT_MISSING',
  SHIFT_NOT_BOOKED: 'SHIFT_NOT_BOOKED',
  ORDER_CLICK_THROUGH: 'ORDER_CLICK_THROUGH',
  LATE_CLOCK_IN: 'LATE_CLOCK_IN',
  EARLY_CLOCK_OUT: 'EARLY_CLOCK_OUT',
  ZONE_MISMATCH: 'ZONE_MISMATCH',
  OUT_OF_ZONE: 'OUT_OF_ZONE',
  CASH_THRESHOLD_EXCEEDED: 'CASH_THRESHOLD_EXCEEDED'
};

exports.KpiCategory = exports.$Enums.KpiCategory = {
  ATTENDANCE: 'ATTENDANCE',
  ORDERS: 'ORDERS',
  DELIVERY_EFFICIENCY: 'DELIVERY_EFFICIENCY',
  FINANCIAL: 'FINANCIAL',
  VIOLATION: 'VIOLATION',
  CUSTOM: 'CUSTOM'
};

exports.KpiUnit = exports.$Enums.KpiUnit = {
  PERCENTAGE: 'PERCENTAGE',
  COUNT: 'COUNT',
  MINUTES: 'MINUTES',
  HOURS: 'HOURS',
  CURRENCY: 'CURRENCY',
  SCORE: 'SCORE'
};

exports.NotificationChannel = exports.$Enums.NotificationChannel = {
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
  SMS: 'SMS'
};

exports.NotificationDeliveryStatus = exports.$Enums.NotificationDeliveryStatus = {
  QUEUED: 'QUEUED',
  SENDING: 'SENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  DEAD: 'DEAD'
};

exports.ViolationType = exports.$Enums.ViolationType = {
  LATE_PICKUP: 'LATE_PICKUP',
  ORDER_REJECTION_TIMEOUT: 'ORDER_REJECTION_TIMEOUT',
  DROP_OFF_IN_ADVANCE: 'DROP_OFF_IN_ADVANCE',
  ORDER_SLIGHTLY_LATE: 'ORDER_SLIGHTLY_LATE',
  ORDER_VERY_LATE: 'ORDER_VERY_LATE',
  INVALID_DELIVERY_PHOTO: 'INVALID_DELIVERY_PHOTO',
  GPS_NOT_UPLOADING: 'GPS_NOT_UPLOADING',
  CASH_DISCREPANCY: 'CASH_DISCREPANCY',
  DELIVEROO_UNASSIGNED_ORDER: 'DELIVEROO_UNASSIGNED_ORDER',
  AMERICANA_LATE_ARRIVAL: 'AMERICANA_LATE_ARRIVAL',
  AMERICANA_NO_SHOW: 'AMERICANA_NO_SHOW',
  AMERICANA_EARLY_DEPARTURE_QUIT: 'AMERICANA_EARLY_DEPARTURE_QUIT',
  LOW_CUSTOMER_RATING: 'LOW_CUSTOMER_RATING'
};

exports.ViolationStatus = exports.$Enums.ViolationStatus = {
  ESTABLISHED: 'ESTABLISHED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  OVERTURNED: 'OVERTURNED',
  EXPIRED: 'EXPIRED'
};

exports.AppealStatus = exports.$Enums.AppealStatus = {
  NOT_RAISED: 'NOT_RAISED',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

exports.BillingStatus = exports.$Enums.BillingStatus = {
  PENDING_INVOICE: 'PENDING_INVOICE',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  APPROVED: 'APPROVED',
  PAID: 'PAID',
  REJECTED: 'REJECTED'
};

exports.TaxInvoiceStatus = exports.$Enums.TaxInvoiceStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED'
};

exports.WithdrawalStatus = exports.$Enums.WithdrawalStatus = {
  PENDING: 'PENDING',
  WITHDRAWN: 'WITHDRAWN',
  FAILED: 'FAILED'
};

exports.DeliveryOrderSource = exports.$Enums.DeliveryOrderSource = {
  FOODICS: 'FOODICS',
  VENDOR_PORTAL: 'VENDOR_PORTAL',
  SUPERVISOR: 'SUPERVISOR',
  PARTNER_API: 'PARTNER_API'
};

exports.DeliveryOrderStatus = exports.$Enums.DeliveryOrderStatus = {
  CREATED: 'CREATED',
  REJECTED: 'REJECTED',
  DISPATCHING: 'DISPATCHING',
  NO_DRIVER: 'NO_DRIVER',
  ASSIGNED: 'ASSIGNED',
  PICKED_UP: 'PICKED_UP',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  RETURNED: 'RETURNED'
};

exports.PaymentMethod = exports.$Enums.PaymentMethod = {
  COD: 'COD',
  PREPAID: 'PREPAID'
};

exports.OfferStatus = exports.$Enums.OfferStatus = {
  OFFERED: 'OFFERED',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED'
};

exports.WalletOwnerType = exports.$Enums.WalletOwnerType = {
  DRIVER_CASH: 'DRIVER_CASH',
  VENDOR_PAYABLE: 'VENDOR_PAYABLE',
  PLATFORM_REVENUE: 'PLATFORM_REVENUE',
  PLATFORM_CLEARING: 'PLATFORM_CLEARING'
};

exports.WalletTxType = exports.$Enums.WalletTxType = {
  COD_SETTLEMENT: 'COD_SETTLEMENT',
  PREPAID_SETTLEMENT: 'PREPAID_SETTLEMENT',
  REMITTANCE: 'REMITTANCE',
  ADJUSTMENT: 'ADJUSTMENT',
  VENDOR_PAYOUT: 'VENDOR_PAYOUT',
  REFUND: 'REFUND',
  TIP: 'TIP',
  FLEET_PAYOUT: 'FLEET_PAYOUT'
};

exports.IncidentType = exports.$Enums.IncidentType = {
  SOS: 'SOS',
  ACCIDENT: 'ACCIDENT',
  VEHICLE_BREAKDOWN: 'VEHICLE_BREAKDOWN',
  CUSTOMER_ISSUE: 'CUSTOMER_ISSUE',
  OTHER: 'OTHER'
};

exports.IncidentStatus = exports.$Enums.IncidentStatus = {
  OPEN: 'OPEN',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  RESOLVED: 'RESOLVED'
};

exports.FoodicsConnStatus = exports.$Enums.FoodicsConnStatus = {
  PENDING: 'PENDING',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR'
};

exports.WebhookEventStatus = exports.$Enums.WebhookEventStatus = {
  RECEIVED: 'RECEIVED',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED'
};

exports.Prisma.ModelName = {
  Tenant: 'Tenant',
  Company: 'Company',
  OwnerGroup: 'OwnerGroup',
  User: 'User',
  Driver: 'Driver',
  DriverRestriction: 'DriverRestriction',
  DriverInventory: 'DriverInventory',
  RecruitmentPipeline: 'RecruitmentPipeline',
  Vehicle: 'Vehicle',
  VehicleDriverAssignment: 'VehicleDriverAssignment',
  Shift: 'Shift',
  AttendanceRecord: 'AttendanceRecord',
  OrderLog: 'OrderLog',
  CashRecord: 'CashRecord',
  CashTransaction: 'CashTransaction',
  PendingDuesLedger: 'PendingDuesLedger',
  VehicleInspection: 'VehicleInspection',
  MaintenanceRecord: 'MaintenanceRecord',
  Device: 'Device',
  Sim: 'Sim',
  CapturedOrder: 'CapturedOrder',
  LocationLog: 'LocationLog',
  AppUsageLog: 'AppUsageLog',
  DeviceCommand: 'DeviceCommand',
  AiScore: 'AiScore',
  Alert: 'Alert',
  AiDigest: 'AiDigest',
  AuditLog: 'AuditLog',
  Ticket: 'Ticket',
  LeaveRequest: 'LeaveRequest',
  TalabatSession: 'TalabatSession',
  TalabatViolationEvent: 'TalabatViolationEvent',
  TalabatDelivery: 'TalabatDelivery',
  KeetaDailyMetrics: 'KeetaDailyMetrics',
  IngestRun: 'IngestRun',
  DeliverooDailyMetrics: 'DeliverooDailyMetrics',
  TalabatDailyMetrics: 'TalabatDailyMetrics',
  PlatformSettings: 'PlatformSettings',
  PlatformInventory: 'PlatformInventory',
  AmericanaDailyOrders: 'AmericanaDailyOrders',
  AmericanaChain: 'AmericanaChain',
  AmericanaStore: 'AmericanaStore',
  AmericanaContract: 'AmericanaContract',
  AmericanaChainRate: 'AmericanaChainRate',
  DriverBatchHistory: 'DriverBatchHistory',
  AmericanaStoreAssignment: 'AmericanaStoreAssignment',
  AmericanaDailyIngestion: 'AmericanaDailyIngestion',
  KpiDefinition: 'KpiDefinition',
  KpiRecord: 'KpiRecord',
  Notification: 'Notification',
  NotificationDelivery: 'NotificationDelivery',
  NotificationRule: 'NotificationRule',
  CourierOnlineSession: 'CourierOnlineSession',
  Violation: 'Violation',
  Penalty: 'Penalty',
  Appeal: 'Appeal',
  OrderEvent: 'OrderEvent',
  AiInsight: 'AiInsight',
  DemandHeatmap: 'DemandHeatmap',
  DeliveryArea: 'DeliveryArea',
  CourierAttendanceSlot: 'CourierAttendanceSlot',
  KeetaAvailableShiftSlot: 'KeetaAvailableShiftSlot',
  ShiftComplianceConfig: 'ShiftComplianceConfig',
  Partner: 'Partner',
  PartnerBankAccount: 'PartnerBankAccount',
  IncentiveTargetRound: 'IncentiveTargetRound',
  IncentiveGoal: 'IncentiveGoal',
  IncentiveTier: 'IncentiveTier',
  CourierIncentivePayout: 'CourierIncentivePayout',
  Billing: 'Billing',
  TaxInvoice: 'TaxInvoice',
  PaymentWithdrawal: 'PaymentWithdrawal',
  AgentRunLog: 'AgentRunLog',
  AgentToolCall: 'AgentToolCall',
  PendingAgentAction: 'PendingAgentAction',
  AgentAction: 'AgentAction',
  AgentMemory: 'AgentMemory',
  PinnedView: 'PinnedView',
  PerformanceSnapshot: 'PerformanceSnapshot',
  MetricEvent: 'MetricEvent',
  ChatThread: 'ChatThread',
  ChatMessage: 'ChatMessage',
  ScheduledBriefing: 'ScheduledBriefing',
  Vendor: 'Vendor',
  VendorBranch: 'VendorBranch',
  DeliveryZone: 'DeliveryZone',
  ZoneSurcharge: 'ZoneSurcharge',
  FulfillmentSettings: 'FulfillmentSettings',
  DeliveryOrder: 'DeliveryOrder',
  DispatchOffer: 'DispatchOffer',
  WalletAccount: 'WalletAccount',
  WalletTransaction: 'WalletTransaction',
  WalletEntry: 'WalletEntry',
  Remittance: 'Remittance',
  WalletReconciliationRun: 'WalletReconciliationRun',
  Incident: 'Incident',
  FoodicsConnection: 'FoodicsConnection',
  WebhookEvent: 'WebhookEvent',
  ApiKey: 'ApiKey',
  OrderRating: 'OrderRating',
  VendorStatement: 'VendorStatement',
  Refund: 'Refund',
  FleetPartner: 'FleetPartner',
  FleetPayoutStatement: 'FleetPayoutStatement'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
