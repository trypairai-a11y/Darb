import type { AttentionItem } from "@/components/command-centre/AttentionFeed";

/**
 * Mock data used as a graceful fallback when the agent runtime is not running
 * (no ANTHROPIC_API_KEY, no tenant data, or first-time preview). Every /v2
 * page falls back to these so the redesign can be demo'd end-to-end before
 * live agents are producing output.
 */

export const MOCK_PULSE = {
  onShift: 124,
  ordersInFlight: 68,
  cashPendingKd: 2340.5,
  openViolations: 7,
  queuePending: 3,
};

export const MOCK_BRIEFING = {
  summary:
    "Ops are on track overall. 14 late-delivery violations today are clustered in Salmiya 18:00–20:00 — zone is short 2 couriers.",
  alerts: [
    "Cash gap KD 8.200 for driver Ahmed A. has grown for a 4th consecutive day — Recon Agent flagged for review.",
    "Flight-mode suspected on 2 Keeta bikes (GPS gap >12 min).",
  ],
  recommendations: [
    "Pull 2 Keeta-Hawally couriers to Salmiya for the 18:00 window.",
    "Review Ahmed's cash pattern before end of shift — Recon Agent has receipts cross-referenced.",
  ],
  generatedAt: new Date().toISOString(),
};

export const MOCK_ATTENTION: AttentionItem[] = [
  {
    id: "mock-1",
    agentId: "triage",
    toolName: "proposeAppealDecision",
    recommendation: "approve",
    reasoning:
      "Appeal #472 (Ahmed A., LATE_PICKUP): GPS track shows 14-min merchant delay — corroborating orders from other couriers in the same zone confirm traffic. 6 similar appeals overturned in last 30 days.",
    confidence: 0.92,
    priorityScore: 0.78,
    subjectType: "appeal",
    subjectId: "472a6e11-0b88-4c7a-9f3e-11d5a7d3e0f2",
    createdAt: new Date(Date.now() - 8 * 60_000).toISOString(),
  },
  {
    id: "mock-2",
    agentId: "reconciliation",
    toolName: "flagForReview",
    recommendation: "escalate",
    reasoning:
      "Driver Saeed K. has 4 consecutive days of unexplained cash gaps summing KD 32.700. No matching refunds/cancellations in OrderEvent log. Recommend escalation to accountant.",
    confidence: 0.87,
    priorityScore: 0.91,
    subjectType: "cash_record",
    subjectId: "cr-9a8f21b0",
    createdAt: new Date(Date.now() - 21 * 60_000).toISOString(),
  },
  {
    id: "mock-3",
    agentId: "triage",
    toolName: "proposeCoachingMessage",
    recommendation: "approve",
    reasoning:
      "Driver Fahad R. has 3 late deliveries this week, all in Salmiya 18:00–20:00. Suggest coaching: leave Hawally pickup 15 min earlier during the peak window.",
    confidence: 0.84,
    priorityScore: 0.52,
    subjectType: "driver",
    subjectId: "drv-fahad-r",
    createdAt: new Date(Date.now() - 44 * 60_000).toISOString(),
  },
  {
    id: "mock-4",
    agentId: "triage",
    toolName: "snoozeAlert",
    recommendation: "approve",
    reasoning:
      "GPS gap alert for bike KW-K-2231 resolved on its own 9 minutes ago (Device.lastSeen < 2 min). Safe to acknowledge.",
    confidence: 0.96,
    priorityScore: 0.21,
    subjectType: "alert",
    subjectId: "alert-6611",
    createdAt: new Date(Date.now() - 62 * 60_000).toISOString(),
  },
  {
    id: "mock-5",
    agentId: "triage",
    toolName: "proposeAppealDecision",
    recommendation: "reject",
    reasoning:
      "Appeal #475 (INVALID_DELIVERY_PHOTO): AI OCR confirms the photo shows an unrelated receipt. Driver has 2 overturned photo appeals on stronger evidence in the last 60 days; this one is weak.",
    confidence: 0.79,
    priorityScore: 0.46,
    subjectType: "appeal",
    subjectId: "475bc201",
    createdAt: new Date(Date.now() - 94 * 60_000).toISOString(),
  },
];

export const MOCK_DRIVERS = [
  { id: "drv-1", name: "Ahmed A.", platform: "KEETA", score: 86, trend: "UP", zone: "Hawally", status: "ACTIVE", onShift: true },
  { id: "drv-2", name: "Saeed K.", platform: "KEETA", score: 54, trend: "DOWN", zone: "Salmiya", status: "ACTIVE", onShift: true, flag: "cash-gap" },
  { id: "drv-3", name: "Fahad R.", platform: "KEETA", score: 71, trend: "DOWN", zone: "Salmiya", status: "ACTIVE", onShift: false, flag: "late-repeats" },
  { id: "drv-4", name: "Hussein M.", platform: "TALABAT", score: 91, trend: "UP", zone: "Avenues", status: "ACTIVE", onShift: true },
  { id: "drv-5", name: "Mohammed J.", platform: "KEETA", score: 68, trend: "STABLE", zone: "Jabriya", status: "LEAVE", onShift: false },
];

export const MOCK_DISPATCH_GAPS = [
  { id: "gap-1", zone: "Salmiya", slot: "18:00–20:00", assigned: 3, target: 7, severity: "critical" as const },
  { id: "gap-2", zone: "Hawally", slot: "14:00–16:00", assigned: 5, target: 6, severity: "warning" as const },
  { id: "gap-3", zone: "Avenues", slot: "20:00–22:00", assigned: 8, target: 8, severity: "ok" as const },
];

export const MOCK_ORDERS = [
  { id: "ord-1", platform: "KEETA", status: "DELIVERED", driver: "Ahmed A.", merchant: "Burger Hub", customer: "Salmiya", kd: "4.250", eta: "on-time", at: "18:42" },
  { id: "ord-2", platform: "KEETA", status: "LATE", driver: "Fahad R.", merchant: "Pizza One", customer: "Salmiya", kd: "6.100", eta: "+7m", at: "18:51" },
  { id: "ord-3", platform: "TALABAT", status: "IN_FLIGHT", driver: "Hussein M.", merchant: "Sushi Bar", customer: "Avenues", kd: "9.800", eta: "on-time", at: "19:02" },
];

export const MOCK_MONEY = {
  cashPending: { records: 87, totalKd: 2340.5 },
  cashReconciled: { records: 412, totalKd: 18905.0 },
};

export const MOCK_INTEL = {
  driverCount: 236,
  avgCompositeScore: 74.2,
  topZoneByOrders: "Salmiya",
  weeklyOrders: 3418,
  weeklyOrderTrend: "+6.4%",
};
