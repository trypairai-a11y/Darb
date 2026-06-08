/**
 * mockData.ts — single source of demo data for the Darb driver app.
 *
 * The app ships in a "demo" mode where every screen renders rich, consistent
 * mock data instead of talking to the backend. All numbers below are coherent
 * around one driver (Qadir Baloch · Deliveroo · Hawally) so the app reads like
 * a real shift in progress. To go back to live data, re-wire the screens to the
 * `client.ts` fetch helpers.
 */

// ─── Relative-date helpers so "today" / "this week" labels stay correct ───
function at(hour: number, minute = 0, dayOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString();
}

// ─── Driver profile ───
export const mockProfile = {
  id: "drv_qadir_001",
  name: "Qadir Baloch",
  phone: "+965 9712 4408",
  platform: "DELIVEROO",
  vehicleType: "Motorcycle",
  vehiclePlate: "5 / 38291",
  vehicleLabel: "Honda PCX 150",
  status: "ACTIVE",
  company: "Darb Logistics",
  supervisor: "Ahmed Al-Rashidi",
  zone: "Hawally",
  batchNumber: "B-12",
  hireDate: "2024-11-03",
  civilIdStatus: "VALID",
  drivingLicenseStatus: "VALID",
  healthCertStatus: "VALID",
  simNumber: "+965 5061 7732",
  device: { model: "iPhone 13", osVersion: "iOS 18.2" },
  score: 74,
};

// ─── Active + next shift (shared with the dashboard) ───
const activeShift = {
  id: "shift_today",
  area: "Hawally",
  startTime: at(8, 0, 0),
  endTime: at(17, 0, 0),
  status: "IN_PROGRESS",
};

// ─── Dashboard stats ───
export const mockDashboardStats = {
  driverName: mockProfile.name,
  platform: mockProfile.platform,
  zone: mockProfile.zone,
  ordersToday: 18,
  weekOrders: 112,
  todayCash: 64.25,
  cashDue: 18.75,
  onlineMinutes: 372, // 6h 12m
  completionRate: 96,
  rating: 4.8,
  score: 74,
  openTickets: 1,
  onShift: true,
  activeShift,
  nextShift: null,
};

// ─── Orders (last 7 days) ───
export const mockOrders = [
  { id: "o1", platform: "DELIVEROO", status: "DELIVERED", merchantName: "Shake Shack — The Avenues", deliveryAddress: "Block 4, Salem Al Mubarak St, Salmiya", amount: 6.75, cashCollected: 6.75, orderCount: 1, orderNumber: "DLV-9921", createdAt: minutesAgo(35) },
  { id: "o2", platform: "DELIVEROO", status: "DELIVERED", merchantName: "Pick — Hawally", deliveryAddress: "Block 9, Tunis St, Hawally", amount: 4.25, cashCollected: 4.25, orderCount: 1, orderNumber: "DLV-9918", createdAt: minutesAgo(78) },
  { id: "o3", platform: "DELIVEROO", status: "DELIVERED", merchantName: "Burger Boutique — Jabriya", deliveryAddress: "Block 1A, Jabriya", amount: 5.5, cashCollected: 0, orderCount: 1, orderNumber: "DLV-9905", createdAt: minutesAgo(126) },
  { id: "o4", platform: "DELIVEROO", status: "DELIVERED", merchantName: "Caribou Coffee — Salmiya", deliveryAddress: "Block 10, Salmiya", amount: 3.1, cashCollected: 3.1, orderCount: 1, orderNumber: "DLV-9890", createdAt: minutesAgo(190) },
  { id: "o5", platform: "DELIVEROO", status: "DELIVERED", merchantName: "Slider Station — Hawally", deliveryAddress: "Block 6, Beirut St, Hawally", amount: 7.4, cashCollected: 7.4, orderCount: 1, orderNumber: "DLV-9871", createdAt: at(11, 5, 0) },
  { id: "o6", platform: "DELIVEROO", status: "DELIVERED", merchantName: "Solo Pizza — Salmiya", deliveryAddress: "Block 12, Salmiya", amount: 9.2, cashCollected: 9.2, orderCount: 1, orderNumber: "DLV-9844", createdAt: at(20, 40, -1) },
  { id: "o7", platform: "DELIVEROO", status: "DELIVERED", merchantName: "Freej Swaleh — Hawally", deliveryAddress: "Block 3, Hawally", amount: 5.0, cashCollected: 5.0, orderCount: 1, orderNumber: "DLV-9810", createdAt: at(19, 15, -1) },
  { id: "o8", platform: "DELIVEROO", status: "CANCELLED", merchantName: "Pizza Hut — Jabriya", deliveryAddress: "Block 7, Jabriya", amount: 0, cashCollected: 0, orderCount: 1, orderNumber: "DLV-9788", createdAt: at(13, 30, -2) },
];

// ─── Shifts (rolling schedule) ───
export const mockShifts = [
  { id: "s1", date: at(8, 0, 0), startTime: at(8, 0, 0), endTime: at(17, 0, 0), area: "Hawally", status: "IN_PROGRESS", actualStart: at(8, 2, 0), actualEnd: null, platform: "DELIVEROO" },
  { id: "s2", date: at(8, 0, 1), startTime: at(8, 0, 1), endTime: at(17, 0, 1), area: "Salmiya", status: "SCHEDULED", actualStart: null, actualEnd: null, platform: "DELIVEROO" },
  { id: "s3", date: at(16, 0, 2), startTime: at(16, 0, 2), endTime: at(23, 0, 2), area: "Hawally", status: "SCHEDULED", actualStart: null, actualEnd: null, platform: "DELIVEROO" },
  { id: "s4", date: at(8, 0, 3), startTime: at(8, 0, 3), endTime: at(17, 0, 3), area: "Jabriya", status: "SCHEDULED", actualStart: null, actualEnd: null, platform: "DELIVEROO" },
  { id: "s5", date: at(8, 0, -1), startTime: at(8, 0, -1), endTime: at(17, 0, -1), area: "Hawally", status: "COMPLETED", actualStart: at(7, 58, -1), actualEnd: at(17, 4, -1), platform: "DELIVEROO" },
  { id: "s6", date: at(8, 0, -2), startTime: at(8, 0, -2), endTime: at(17, 0, -2), area: "Salmiya", status: "COMPLETED", actualStart: at(8, 12, -2), actualEnd: at(17, 0, -2), platform: "DELIVEROO" },
];

// ─── Darb Points ───
const now = new Date();
export const mockPoints = {
  driver: { id: mockProfile.id, name: mockProfile.name, platform: mockProfile.platform, phone: mockProfile.phone },
  period: { year: now.getFullYear(), month: now.getMonth() + 1 },
  current: {
    totalScore: 74,
    attendanceScore: 26,
    ordersScore: 22,
    hoursScore: 16,
    violationsScore: 10,
    onTimePct: 92,
    ordersCount: 112,
    hoursWorked: 168.5,
    violationsCount: 2,
    perPlatform: { DELIVEROO: { ordersCount: 112, hoursWorked: 168.5 } },
    computedAt: minutesAgo(120),
  },
  trend: [
    { year: now.getFullYear(), month: ((now.getMonth() + 6) % 12) + 1, totalScore: 68 },
    { year: now.getFullYear(), month: ((now.getMonth() + 7) % 12) + 1, totalScore: 71 },
    { year: now.getFullYear(), month: ((now.getMonth() + 8) % 12) + 1, totalScore: 65 },
    { year: now.getFullYear(), month: ((now.getMonth() + 9) % 12) + 1, totalScore: 78 },
    { year: now.getFullYear(), month: ((now.getMonth() + 10) % 12) + 1, totalScore: 80 },
    { year: now.getFullYear(), month: now.getMonth() + 1, totalScore: 74 },
  ],
};

// ─── Tickets ───
export const mockTickets = [
  {
    id: "t1", ticketNumber: "TKT-001042", category: "VEHICLE_REPAIR",
    title: "Front brake needs adjustment", description: "The front brake on the Honda PCX feels loose and squeaks when stopping. Would like it checked before my next shift.",
    status: "IN_PROGRESS", priority: "MEDIUM", photos: null, resolution: null, resolvedAt: null,
    createdAt: minutesAgo(60 * 20), slaDeadline: at(18, 0, 1),
  },
  {
    id: "t2", ticketNumber: "TKT-001028", category: "EQUIPMENT_REQUEST",
    title: "New thermal delivery bag", description: "Current bag zipper is broken. Requesting a replacement insulated bag.",
    status: "RESOLVED", priority: "LOW", photos: null,
    resolution: "New thermal bag issued at Hawally hub. Collected on shift start.", resolvedAt: minutesAgo(60 * 48),
    createdAt: minutesAgo(60 * 96), slaDeadline: null,
  },
  {
    id: "t3", ticketNumber: "TKT-000991", category: "SALARY_ISSUE",
    title: "Missing incentive for last week", description: "The weekend surge incentive from last week doesn't appear in my statement.",
    status: "RESOLVED", priority: "MEDIUM", photos: null,
    resolution: "Incentive of 12.500 KD recalculated and added to next payout cycle.", resolvedAt: minutesAgo(60 * 120),
    createdAt: minutesAgo(60 * 160), slaDeadline: null,
  },
];

export function getMockTicket(id: string) {
  return mockTickets.find((t) => t.id === id) ?? mockTickets[0];
}

// ─── Notifications ───
export type NotificationCategory = "IMPORTANT" | "OPS_TODO" | "BENEFITS" | "OTHER";

export const mockNotifications = [
  {
    id: "n1",
    category: "IMPORTANT" as NotificationCategory,
    severity: "HIGH",
    title: "GPS not uploading",
    titleAr: "لم يتم تحديث الموقع",
    body: "The system detects that your rider Qadir Baloch hasn't uploaded a GPS location for a while. Open the app and check your connection to stay online.",
    bodyAr: "اكتشف النظام أن موقعك لم يُحدَّث منذ فترة. افتح التطبيق وتحقق من الاتصال للبقاء متصلاً.",
    read: false,
    createdAt: minutesAgo(8),
  },
  {
    id: "n2",
    category: "OPS_TODO" as NotificationCategory,
    severity: "MEDIUM",
    title: "Settle today's cash",
    titleAr: "سدّد نقدية اليوم",
    body: "You have 18.750 KD to settle. Hand it in at the Hawally hub before your next shift.",
    bodyAr: "لديك ١٨.٧٥٠ د.ك للتسوية. سلّمها في مركز حولي قبل ورديتك القادمة.",
    read: false,
    createdAt: minutesAgo(95),
  },
  {
    id: "n3",
    category: "BENEFITS" as NotificationCategory,
    severity: "LOW",
    title: "Weekend surge bonus",
    titleAr: "مكافأة ذروة نهاية الأسبوع",
    body: "Complete 25 orders this weekend in Hawally to earn an extra 10.000 KD incentive.",
    bodyAr: "أكمل ٢٥ طلباً في حولي نهاية هذا الأسبوع لتحصل على حافز إضافي ١٠.٠٠٠ د.ك.",
    read: true,
    createdAt: minutesAgo(60 * 6),
  },
  {
    id: "n4",
    category: "OTHER" as NotificationCategory,
    severity: "LOW",
    title: "App updated to v2.4",
    titleAr: "تم تحديث التطبيق إلى الإصدار ٢.٤",
    body: "Faster shift check-in and a refreshed home screen. Thanks for keeping the app up to date.",
    bodyAr: "تسجيل دخول أسرع للوردية وشاشة رئيسية محدّثة. شكراً لإبقائك التطبيق محدّثاً.",
    read: true,
    createdAt: minutesAgo(60 * 30),
  },
];

// ─── Equipment issued to the driver ───
export const mockEquipment = [
  { id: "eq1", itemType: "BAG", label: "Insulated delivery bag", quantity: 1, issued: true, issuedDate: "2024-11-03", condition: "OK", conditionNote: null, conditionReportedAt: null },
  { id: "eq2", itemType: "JACKET", label: "Branded rain jacket", quantity: 1, issued: true, issuedDate: "2024-11-03", condition: "OK", conditionNote: null, conditionReportedAt: null },
  { id: "eq3", itemType: "HELMET", label: "Safety helmet (M)", quantity: 1, issued: true, issuedDate: "2024-11-03", condition: "CHANGE_REQUESTED", conditionNote: "Strap worn out", conditionReportedAt: minutesAgo(60 * 30) },
  { id: "eq4", itemType: "PHONE_HOLDER", label: "Handlebar phone mount", quantity: 1, issued: true, issuedDate: "2025-02-12", condition: "DAMAGED", conditionNote: "Clamp cracked", conditionReportedAt: minutesAgo(60 * 8) },
  { id: "eq5", itemType: "POWERBANK", label: "Power bank 10,000mAh", quantity: 1, issued: true, issuedDate: "2025-02-12", condition: "OK", conditionNote: null, conditionReportedAt: null },
];

// ─── AI suggestions (home feed) ───
export const mockAiSuggestions = [
  {
    type: "GO_ONLINE_SURGE" as const,
    title: "Surge in Salmiya now",
    titleAr: "ذروة الطلب في السالمية الآن",
    body: "Demand is 1.7× in Salmiya for the next hour. Head over to catch peak orders.",
    bodyAr: "الطلب أعلى بـ ١.٧ مرة في السالمية خلال الساعة القادمة.",
    estimatedValueKD: 8,
    confidence: 0.82,
  },
  {
    type: "TAKE_SHIFT" as const,
    title: "Open shift tomorrow",
    titleAr: "وردية متاحة غداً",
    body: "Salmiya 08:00–17:00 is open. Tap to claim it before it fills.",
    bodyAr: "وردية السالمية ٨ صباحاً حتى ٥ مساءً متاحة الآن.",
    confidence: 0.74,
  },
  {
    type: "EARNINGS_INSIGHT" as const,
    title: "On track this week",
    titleAr: "أداؤك ممتاز هذا الأسبوع",
    body: "112 orders so far — 8% ahead of last week. Keep it up!",
    bodyAr: "١١٢ طلب حتى الآن، أعلى بنسبة ٨٪ عن الأسبوع الماضي.",
    confidence: 0.9,
  },
];
