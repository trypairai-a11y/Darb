import type {
  AgentActionRow,
  AuditListResponse,
  DecisionCardData,
  DecisionsListResponse,
} from "@/types/decisions";

const now = Date.now();

export const DEMO_DECISION_CARDS: DecisionCardData[] = [
  {
    id: "demo-decision-gps-stale",
    tag: "Warn",
    confidence: 0.92,
    driverName: "Saeed K.",
    driverId: "demo-driver-saeed",
    headline: "Saeed K. - GPS stale for 18 minutes during active Keeta shift",
    reasoning:
      "Saeed is assigned to Salmiya dinner peak, but the last GPS ping is 18 minutes old while orders are still active. Darb recommends sending a bilingual check-in before this becomes an auto-violation.",
    evidence: [
      {
        type: "gps",
        label: "Last GPS ping 18 min ago",
        entityType: "LocationLog",
        entityId: "demo-gps-1",
      },
      {
        type: "shift",
        label: "Active shift: Salmiya 18:00-22:00",
        entityType: "Shift",
        entityId: "demo-shift-1",
      },
    ],
    proposalDraft: {
      toolName: "draftCourierMessage",
      args: {
        driverId: "demo-driver-saeed",
        intent: "WARN_GPS_STALE",
        bodyEnglish:
          "Saeed, your GPS has not updated for 18 minutes while you are on shift. Please open Darb and confirm you are online.",
      },
      reasoning:
        "GPS is stale during an active shift and this driver is covering a high-demand zone.",
      subjectType: "Driver",
      subjectId: "demo-driver-saeed",
    },
    toolName: "draftCourierMessage",
    toolIsLive: true,
    state: "pending",
    createdAt: new Date(now - 8 * 60_000).toISOString(),
  },
  {
    id: "demo-decision-cash",
    tag: "Cash reminder",
    confidence: 0.88,
    driverName: "Hari Prasad",
    driverId: "demo-driver-hari",
    headline: "Hari Prasad - KD 86.750 cash overdue for 4 days",
    reasoning:
      "Cash balance is above the tenant threshold and has aged past the normal deposit window. Darb recommends a polite reminder now and accountant escalation if unpaid by tonight.",
    evidence: [
      {
        type: "cashRecord",
        label: "KD 86.750 pending, 4 days old",
        entityType: "CashRecord",
        entityId: "demo-cash-1",
      },
      {
        type: "note",
        label: "No matching bank transfer found",
        entityType: "AgentEvidence",
        entityId: "demo-note-1",
      },
    ],
    proposalDraft: {
      toolName: "draftCourierMessage",
      args: {
        driverId: "demo-driver-hari",
        intent: "CASH_REMINDER",
        amountKd: 86.75,
        bodyEnglish:
          "Hari, you have KD 86.750 pending from COD collections. Please deposit before 9 PM and upload the receipt.",
      },
      reasoning: "Overdue COD balance should be reminded before escalation.",
      subjectType: "Driver",
      subjectId: "demo-driver-hari",
    },
    toolName: "draftCourierMessage",
    toolIsLive: true,
    state: "pending",
    createdAt: new Date(now - 22 * 60_000).toISOString(),
  },
  {
    id: "demo-decision-promote",
    tag: "Promote",
    confidence: 0.81,
    driverName: "Mohammed Ali",
    driverId: "demo-driver-mohammed",
    headline: "Mohammed Ali - top 5% performer for 3 weeks straight",
    reasoning:
      "Mohammed has kept a 96 performance score, zero established violations, and high dinner-peak acceptance. Darb recommends a recognition message and adding him to the incentive shortlist.",
    evidence: [
      {
        type: "note",
        label: "96 composite score, 21-day streak",
        entityType: "PerformanceSnapshot",
        entityId: "demo-score-1",
      },
      {
        type: "violation",
        label: "0 established violations this month",
        entityType: "Violation",
        entityId: "demo-violation-clear",
      },
    ],
    proposalDraft: {
      toolName: "draftCourierMessage",
      args: {
        driverId: "demo-driver-mohammed",
        intent: "PROMOTE_TOP_PERFORMER",
        bodyEnglish:
          "Mohammed, excellent work this month. You are one of the top performers in the fleet. Keep this up for the incentive shortlist.",
      },
      reasoning: "Positive reinforcement for sustained top performance.",
      subjectType: "Driver",
      subjectId: "demo-driver-mohammed",
    },
    toolName: "draftCourierMessage",
    toolIsLive: true,
    state: "pending",
    createdAt: new Date(now - 41 * 60_000).toISOString(),
  },
  {
    id: "demo-decision-review",
    tag: "Review",
    confidence: 0.76,
    driverName: "Fahad R.",
    driverId: "demo-driver-fahad",
    headline: "Fahad R. - repeat late pickups clustered in Salmiya",
    reasoning:
      "Three late pickups happened in the same dinner window, and route history suggests the driver is accepting orders too far from his current area. Darb recommends supervisor review before applying a penalty.",
    evidence: [
      {
        type: "violation",
        label: "3 late-pickup violations in 7 days",
        entityType: "Violation",
        entityId: "demo-violations-fahad",
      },
      {
        type: "order",
        label: "Average pickup arrival +11 min",
        entityType: "OrderEvent",
        entityId: "demo-order-fahad",
      },
    ],
    proposalDraft: {
      toolName: "flagForReview",
      args: {
        driverId: "demo-driver-fahad",
        reason: "Repeated late pickups in Salmiya dinner peak",
      },
      reasoning: "Pattern is real but should be reviewed before penalty.",
      subjectType: "Driver",
      subjectId: "demo-driver-fahad",
    },
    toolName: "flagForReview",
    toolIsLive: false,
    state: "pending",
    createdAt: new Date(now - 62 * 60_000).toISOString(),
  },
];

export const DEMO_AUDIT_ROWS: AgentActionRow[] = [
  {
    id: "demo-audit-1",
    tenantId: "demo-tenant",
    proposer: "Darb",
    approverId: "demo-osama",
    agentRunId: "demo-run-1",
    toolName: "draftCourierMessage",
    originalProposal: { intent: "CASH_REMINDER", amountKd: 42.5 },
    modificationsBeforeApproval: null,
    outcome: "success",
    errorMessage: null,
    reasoning: "Cash reminder approved for overdue COD balance.",
    subjectType: "Driver",
    subjectId: "demo-driver-1",
    rolledBackAt: null,
    rolledBackById: null,
    rollbackReason: null,
    createdAt: new Date(now - 2 * 60 * 60_000).toISOString(),
  },
  {
    id: "demo-audit-2",
    tenantId: "demo-tenant",
    proposer: "Darb",
    approverId: "demo-osama",
    agentRunId: "demo-run-2",
    toolName: "flagForReview",
    originalProposal: { reason: "Repeated GPS gaps" },
    modificationsBeforeApproval: { reason: "Repeated GPS gaps during shift" },
    outcome: "success",
    errorMessage: null,
    reasoning: "Supervisor review created for GPS pattern.",
    subjectType: "Driver",
    subjectId: "demo-driver-2",
    rolledBackAt: null,
    rolledBackById: null,
    rollbackReason: null,
    createdAt: new Date(now - 26 * 60 * 60_000).toISOString(),
  },
];

function countByFilter(cards: DecisionCardData[]) {
  return {
    all: cards.length,
    pending: cards.filter((c) => c.state === "pending").length,
    "high-conf": cards.filter((c) => c.confidence >= 0.8).length,
    "this-week": cards.length,
    penalty: cards.filter((c) => c.tag === "Penalty").length,
    cash: cards.filter((c) => c.tag === "Cash reminder").length,
    warn: cards.filter((c) => c.tag === "Warn").length,
    suspend: cards.filter((c) => c.tag === "Suspend").length,
    promote: cards.filter((c) => c.tag === "Promote").length,
  };
}

export function demoDecisionsResponse(): DecisionsListResponse {
  return {
    cards: DEMO_DECISION_CARDS,
    counts: countByFilter(DEMO_DECISION_CARDS),
    pagination: {
      page: 1,
      limit: 25,
      total: DEMO_DECISION_CARDS.length,
      totalPages: 1,
    },
  };
}

export function demoAuditResponse(): AuditListResponse {
  return {
    rows: DEMO_AUDIT_ROWS,
    pagination: {
      page: 1,
      limit: 25,
      total: DEMO_AUDIT_ROWS.length,
      totalPages: 1,
    },
  };
}

export function isDemoDecisionId(id: string) {
  return id.startsWith("demo-decision-");
}
