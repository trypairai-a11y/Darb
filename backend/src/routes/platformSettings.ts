import { Router, Request, Response } from "express";
import { prisma } from "../config";
import { authMiddleware } from "../middleware/auth";
import { tenantScope } from "../middleware/tenantScope";
import { rbac } from "../middleware/rbac";
import { encryptCred, hasEncryptedShape } from "../utils/portalCreds";

const router = Router();
router.use(authMiddleware, tenantScope);

const ADMINS = ["ADMIN", "OPS_MANAGER"];

// GET /api/platform-settings/:platform
router.get("/:platform", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const platform = req.params.platform.toUpperCase();

    const settings = await prisma.platformSettings.findUnique({
      where: { tenantId_platform: { tenantId, platform: platform as any } },
    });

    if (!settings) {
      // Return defaults based on platform
      res.json({
        platform,
        targets: getDefaultTargets(platform),
        kpis: getDefaultKpis(platform),
        shiftRules: getDefaultShiftRules(),
        zones: getDefaultZones(platform),
        violationRules: getDefaultViolationRules(platform),
        cashRules: getDefaultCashRules(),
        bookingRules: getDefaultBookingRules(platform),
        documentRules: getDefaultDocumentRules(),
        notificationConfig: getDefaultNotificationConfig(),
      });
      return;
    }

    // Merge defaults for any null fields
    res.json({
      ...settings,
      targets: settings.targets || getDefaultTargets(platform),
      kpis: settings.kpis || getDefaultKpis(platform),
      shiftRules: settings.shiftRules || getDefaultShiftRules(),
      zones: settings.zones || getDefaultZones(platform),
      violationRules: settings.violationRules || getDefaultViolationRules(platform),
      cashRules: settings.cashRules || getDefaultCashRules(),
      bookingRules: settings.bookingRules || getDefaultBookingRules(platform),
      documentRules: settings.documentRules || getDefaultDocumentRules(),
      notificationConfig: settings.notificationConfig || getDefaultNotificationConfig(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/platform-settings/:platform
router.put("/:platform", rbac(...ADMINS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const platform = req.params.platform.toUpperCase();
    const { targets, kpis, shiftRules, zones, violationRules, cashRules, bookingRules, documentRules, notificationConfig } = req.body;

    const settings = await prisma.platformSettings.upsert({
      where: { tenantId_platform: { tenantId, platform: platform as any } },
      create: { tenantId, platform: platform as any, targets: targets || getDefaultTargets(platform), kpis, shiftRules, zones, violationRules, cashRules, bookingRules, documentRules, notificationConfig },
      update: { targets, kpis, shiftRules, zones, violationRules, cashRules, bookingRules, documentRules, notificationConfig },
    });

    res.json(settings);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/platform-settings/inventory/all — all platforms in one call
router.get("/inventory/all", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const inventory = await prisma.platformInventory.findMany({
      where: { tenantId },
      orderBy: [{ platform: "asc" }, { itemType: "asc" }],
    });
    res.json({ data: inventory });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/platform-settings/:platform/inventory
router.get("/:platform/inventory", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const platform = req.params.platform.toUpperCase();

    const inventory = await prisma.platformInventory.findMany({
      where: { tenantId, platform: platform as any },
      orderBy: { itemType: "asc" },
    });

    res.json({ data: inventory });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * itemType is a slug, not an enum, so ops can invent kit we never listed. Fold
 * a free-text name down to UPPER_SNAKE so "Rain jacket", "rain-jacket" and
 * "RAIN_JACKET" all land on the same inventory pool instead of three.
 */
function toItemSlug(raw: string): string {
  return String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

// PUT /api/platform-settings/:platform/inventory
router.put("/:platform/inventory", rbac(...ADMINS), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const platform = req.params.platform.toUpperCase();
    const { items } = req.body; // [{ itemType, label?, total, minStock }]

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "items must be a non-empty array" });
      return;
    }

    const results = [];
    for (const item of items) {
      const itemType = toItemSlug(item.itemType ?? "");
      if (!itemType) {
        res.status(400).json({ error: "itemType is required and must contain a letter or digit" });
        return;
      }

      const total = Number(item.total);
      if (!Number.isFinite(total) || total < 0) {
        res.status(400).json({ error: `total must be a number >= 0 for ${itemType}` });
        return;
      }

      const issued = Number(item.issued) || 0;
      const minStock = Number(item.minStock) || 0;
      const label = typeof item.label === "string" && item.label.trim() ? item.label.trim() : undefined;

      const result = await prisma.platformInventory.upsert({
        where: { tenantId_platform_itemType: { tenantId, platform: platform as any, itemType } },
        create: {
          tenantId,
          platform: platform as any,
          itemType,
          label,
          total,
          issued,
          available: total - issued,
          minStock,
        },
        // A label is only ever set, never cleared by an update that omits it:
        // renaming is a separate intent from restocking.
        update: { ...(label ? { label } : {}), total, issued, available: total - issued, minStock },
      });
      results.push(result);
    }

    res.json({ data: results });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/platform-settings/:platform/inventory/:itemType — retire a pool.
// Creating item types without a way to remove a typo is a one-way door.
router.delete(
  "/:platform/inventory/:itemType",
  rbac(...ADMINS),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const platform = req.params.platform.toUpperCase();
      const itemType = toItemSlug(req.params.itemType);

      const existing = await prisma.platformInventory.findUnique({
        where: { tenantId_platform_itemType: { tenantId, platform: platform as any, itemType } },
      });
      if (!existing) {
        res.status(404).json({ error: "Inventory pool not found" });
        return;
      }
      if (existing.issued > 0) {
        res.status(409).json({
          error: `${existing.issued} of these are still issued to drivers. Collect them before removing the item.`,
        });
        return;
      }

      await prisma.platformInventory.delete({ where: { id: existing.id } });
      res.json({ data: { id: existing.id } });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

function getDefaultTargetsBase(platform: string) {
  switch (platform) {
    case "TALABAT":
      return {
        mainTarget: { name: "Orders per Month", key: "ordersPerMonth", value: 18, unit: "orders", description: "Target number of orders per month" },
        subTargets: [
          { name: "Batch Number", key: "batchNumber", value: 1, unit: "batch", description: "Target batch number (1 = best, 7 = worst)" },
          { name: "Daily Hours", key: "dailyHours", value: 12, unit: "hours", description: "Expected hours per day" },
          { name: "UTR", key: "utr", value: 2, unit: "decimal (0–2)", description: "Utilization rate target" },
        ],
      };
    case "KEETA":
      return {
        mainTarget: { name: "Daily Hours", key: "dailyHours", value: 10, unit: "hours", description: "Target online hours per day" },
        subTargets: [
          { name: "On-time Login", key: "onTimeLogin", value: 100, unit: "%", description: "Login at scheduled time" },
          { name: "Number of Orders", key: "ordersPerDay", value: 15, unit: "orders", description: "Target deliveries per day" },
          { name: "Delivery On Time", key: "deliveryOnTime", value: 95, unit: "%", description: "On-time delivery rate" },
          { name: "Completion Rate", key: "completionRate", value: 98, unit: "%", description: "Order completion rate" },
        ],
      };
    case "AMERICANA":
      return {
        mainTarget: { name: "Orders per Month", key: "ordersPerMonth", value: 20, unit: "orders", description: "Target orders per month" },
        subTargets: [
          { name: "Arrive on Time", key: "arriveOnTime", value: 100, unit: "%", description: "Arrive to store on time" },
        ],
      };
    case "DELIVEROO":
      return {
        mainTarget: { name: "Orders per Month", key: "ordersPerMonth", value: 15, unit: "orders", description: "Target orders per month" },
        subTargets: [
          { name: "Daily Hours", key: "dailyHours", value: 10, unit: "hours", description: "Target online hours" },
        ],
      };
    default:
      return { mainTarget: { name: "Orders per Month", key: "ordersPerMonth", value: 15, unit: "orders" }, subTargets: [] };
  }
}

function getDefaultTargets(platform: string) {
  const base = getDefaultTargetsBase(platform);
  return { MOTORCYCLE: base, CAR: JSON.parse(JSON.stringify(base)) };
}

function getDefaultKpis(platform: string) {
  switch (platform) {
    case "TALABAT":
      return {
        gradingScale: [
          { label: "Excellent", minPercent: 90, maxPercent: 100, color: "#22c55e" },
          { label: "Good", minPercent: 70, maxPercent: 89, color: "#3b82f6" },
          { label: "Average", minPercent: 50, maxPercent: 69, color: "#f59e0b" },
          { label: "Below Average", minPercent: 30, maxPercent: 49, color: "#f97316" },
          { label: "Failed", minPercent: 0, maxPercent: 29, color: "#ef4444" },
        ],
        weights: {
          utr: 40,
          batchNumber: 30,
          attendance: 20,
          violation: 10,
        },
        thresholds: {
          utrExcellent: 1.5,
          utrGood: 1.2,
          utrMinimum: 0.8,
          batchBest: 1,
          batchWorst: 7,
        },
      };
    case "KEETA":
      return {
        gradingScale: [
          { label: "Excellent", minPercent: 90, maxPercent: 100, color: "#22c55e" },
          { label: "Good", minPercent: 70, maxPercent: 89, color: "#3b82f6" },
          { label: "Average", minPercent: 50, maxPercent: 69, color: "#f59e0b" },
          { label: "Below Average", minPercent: 30, maxPercent: 49, color: "#f97316" },
          { label: "Failed", minPercent: 0, maxPercent: 29, color: "#ef4444" },
        ],
        weights: {
          dailyHours: 30,
          onTimeLogin: 25,
          ordersPerDay: 20,
          deliveryOnTime: 15,
          completionRate: 10,
        },
      };
    default:
      return {
        gradingScale: [
          { label: "Excellent", minPercent: 90, maxPercent: 100, color: "#22c55e" },
          { label: "Good", minPercent: 70, maxPercent: 89, color: "#3b82f6" },
          { label: "Average", minPercent: 50, maxPercent: 69, color: "#f59e0b" },
          { label: "Failed", minPercent: 0, maxPercent: 49, color: "#ef4444" },
        ],
        weights: { ordersPerDay: 50, attendance: 30, violation: 20 },
      };
  }
}

function getDefaultShiftRules() {
  const base = {
    defaultHoursPerDay: 12,
    maxLateMinutes: 1,
    earlyLogOutMinutes: 15,
    maxCashHoldKD: 50,
  };
  return { MOTORCYCLE: base, CAR: { ...base } };
}

function getDefaultZones(platform: string) {
  switch (platform) {
    case "TALABAT":
      return ["Ardiya", "Hawally", "Mahboula", "Khairan", "Jahra", "Mutla", "Sabah Al Salem"];
    case "KEETA":
      return ["Hawally", "Salmiya", "Ardiya", "Jahra", "Khiran", "Mishref", "Sabah Al Salem", "Abu Halifa", "Fahaheel", "Mangaf"];
    case "DELIVEROO":
      return ["Salmiya", "Hawally", "Sharq", "Kuwait City", "Fintas", "Mangaf"];
    case "AMERICANA":
      return ["Salmiya", "Hawally", "Jabriya", "Farwaniya", "Fahaheel", "Jahra"];
    default:
      return [];
  }
}

function getDefaultViolationRules(platform: string) {
  const baseRules = [
    { type: "LATE_CLOCK_IN", label: "Late Clock-In", penaltyPoints: 2, autoDetect: true, description: "Driver clocks in after scheduled start time" },
    { type: "EARLY_CLOCK_OUT", label: "Early Clock-Out", penaltyPoints: 2, autoDetect: true, description: "Driver clocks out before shift end" },
    { type: "SHIFT_NOT_BOOKED", label: "Shift Not Booked", penaltyPoints: 3, autoDetect: true, description: "Driver did not book required shifts" },
    { type: "CASH_THRESHOLD_EXCEEDED", label: "Cash Threshold Exceeded", penaltyPoints: 5, autoDetect: true, description: "Driver holding cash above allowed limit" },
    { type: "ZONE_MISMATCH", label: "Zone Mismatch", penaltyPoints: 1, autoDetect: false, description: "Driver working in wrong zone" },
    { type: "OUT_OF_ZONE", label: "Out of Zone", penaltyPoints: 1, autoDetect: false, description: "Driver left assigned delivery zone" },
  ];

  if (platform === "TALABAT") {
    return {
      rules: [
        ...baseRules,
        { type: "SELFIE_FAIL", label: "Selfie Verification Failed", penaltyPoints: 3, autoDetect: false, description: "Driver failed selfie verification on Talabat app" },
        { type: "GPS_OFF", label: "GPS Turned Off", penaltyPoints: 4, autoDetect: false, description: "Driver disabled GPS during active shift" },
        { type: "EQUIPMENT_MISSING", label: "Equipment Missing", penaltyPoints: 2, autoDetect: false, description: "Driver missing required equipment (helmet, bag, etc.)" },
        { type: "ORDER_CLICK_THROUGH", label: "Order Click-Through", penaltyPoints: 3, autoDetect: false, description: "Driver accepted order without proper verification" },
      ],
      maxPointsBeforeWarning: 5,
      maxPointsBeforeSuspension: 10,
      pointsResetDays: 30,
    };
  }

  return {
    rules: baseRules,
    maxPointsBeforeWarning: 5,
    maxPointsBeforeSuspension: 10,
    pointsResetDays: 30,
  };
}

function getDefaultCashRules() {
  return {
    maxCashHoldKD: 50,
    overdueDays: 3,
    depositReminderHours: 24,
    allowedDepositMethods: ["CASH", "BANK_TRANSFER", "AL_MUZAINI"],
    autoAlertOnOverdue: true,
    dailyCollectionRequired: false,
    collectionDays: ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"],
    receiptRequired: true,
    penaltyPerOverdueDay: 0,
  };
}

function getDefaultBookingRules(platform: string) {
  if (platform === "TALABAT") {
    return {
      bookingWindowDay: "TUESDAY",
      bookingWindowStartHour: 8,
      bookingWindowEndHour: 11,
      reminderEnabled: true,
      reminderBeforeHours: 24,
      maxShiftsPerWeek: 7,
      minShiftsPerWeek: 5,
      allowSameDay: false,
      autoAssignZone: false,
      defaultShiftDuration: 12,
      breakDurationMinutes: 0,
      maxConsecutiveDays: 7,
    };
  }
  return {
    bookingWindowDay: null,
    bookingWindowStartHour: null,
    bookingWindowEndHour: null,
    reminderEnabled: true,
    reminderBeforeHours: 24,
    maxShiftsPerWeek: 7,
    minShiftsPerWeek: 4,
    allowSameDay: true,
    autoAssignZone: false,
    defaultShiftDuration: 10,
    breakDurationMinutes: 30,
    maxConsecutiveDays: 6,
  };
}

function getDefaultDocumentRules() {
  return {
    requiredDocuments: [
      { key: "healthCert", label: "Health Certificate", required: true, expiryWarningDays: 30 },
      { key: "workPermit", label: "Work Permit", required: true, expiryWarningDays: 60 },
      { key: "foodHandlingCert", label: "Food Handling Certificate", required: true, expiryWarningDays: 30 },
      { key: "vehicleReg", label: "Vehicle Registration", required: true, expiryWarningDays: 30 },
      { key: "vehicleInsurance", label: "Vehicle Insurance", required: true, expiryWarningDays: 45 },
      { key: "drivingLicense", label: "Driving License", required: true, expiryWarningDays: 60 },
      { key: "civilId", label: "Civil ID", required: true, expiryWarningDays: 90 },
    ],
    autoSuspendOnExpiry: true,
    notifyDriverBeforeExpiry: true,
    notifySupervisorBeforeExpiry: true,
    blockShiftBookingOnExpiry: true,
  };
}

function getDefaultNotificationConfig() {
  return {
    channels: {
      inApp: true,
      whatsapp: false,
      sms: false,
      email: false,
    },
    events: [
      { type: "cash_overdue", label: "Cash Deposit Overdue", enabled: true, roles: ["ADMIN", "OPS_MANAGER", "SUPERVISOR"] },
      { type: "SHIFT_NOT_BOOKED", label: "Shift Not Booked", enabled: true, roles: ["ADMIN", "OPS_MANAGER"] },
      { type: "LATE_CLOCK_IN", label: "Late Clock-In", enabled: true, roles: ["SUPERVISOR"] },
      { type: "EARLY_CLOCK_OUT", label: "Early Clock-Out", enabled: true, roles: ["SUPERVISOR"] },
      { type: "doc_expiring", label: "Document Expiring Soon", enabled: true, roles: ["ADMIN", "OPS_MANAGER"] },
      { type: "doc_expired", label: "Document Expired", enabled: true, roles: ["ADMIN", "OPS_MANAGER", "SUPERVISOR"] },
      { type: "low_stock", label: "Low Inventory Stock", enabled: true, roles: ["ADMIN", "OPS_MANAGER"] },
      { type: "driver_suspended", label: "Driver Suspended", enabled: true, roles: ["ADMIN", "OPS_MANAGER"] },
      { type: "batch_change", label: "Batch Number Changed", enabled: false, roles: ["SUPERVISOR"] },
      { type: "vehicle_maintenance", label: "Vehicle Maintenance Due", enabled: true, roles: ["OPS_MANAGER"] },
    ],
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
  };
}

// ─── R6 · Keeta portal credentials (encrypted at rest) ──────────────────────
/**
 * PUT /api/platform-settings/keeta/portal-credentials
 *   body: { username, password }
 * Stores creds AES-256-GCM encrypted under PlatformSettings.notificationConfig.portalCredentials.
 *
 * GET /api/platform-settings/keeta/portal-credentials
 *   Returns only { username, hasPassword } — password plaintext is never exposed.
 */
router.put(
  "/keeta/portal-credentials",
  rbac("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const { username, password } = req.body ?? {};
      if (!username || !password) {
        return res.status(400).json({ error: "username and password required" });
      }

      const encrypted = encryptCred(password);

      const existing = await prisma.platformSettings.findUnique({
        where: { tenantId_platform: { tenantId, platform: "KEETA" } },
      });
      const prevConfig = (existing?.notificationConfig as any) ?? {};
      const nextConfig = {
        ...prevConfig,
        portalCredentials: { username, password: encrypted, updatedAt: new Date().toISOString() },
      };

      const saved = await prisma.platformSettings.upsert({
        where: { tenantId_platform: { tenantId, platform: "KEETA" } },
        update: { notificationConfig: nextConfig },
        create: {
          tenantId,
          platform: "KEETA",
          targets: {},
          notificationConfig: nextConfig,
        },
      });

      res.json({ ok: true, updatedAt: (saved.notificationConfig as any)?.portalCredentials?.updatedAt });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.get(
  "/keeta/portal-credentials",
  rbac("ADMIN", "OPS_MANAGER"),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const settings = await prisma.platformSettings.findUnique({
        where: { tenantId_platform: { tenantId, platform: "KEETA" } },
      });
      const pc = (settings?.notificationConfig as any)?.portalCredentials;
      res.json({
        username: pc?.username ?? null,
        hasPassword: hasEncryptedShape(pc?.password),
        updatedAt: pc?.updatedAt ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;
