// Phase 8 Wave 0 RED test — turned GREEN by Wave 2 (cardProjector exports
// PHASE_8_LIVE_TOOLS and computes toolIsLive as the UNION of
// PHASE_2_LIVE_TOOLS + PHASE_8_LIVE_TOOLS). Do not skip.
//
// Behavior contract (REQ-agent-action-tools / REQ-decisions-proposal-inbox):
//   1. PHASE_8_LIVE_TOOLS Set exported from cardProjector.ts contains
//      exactly the 10 named tools: draftCourierMessage, sendCourierMessage,
//      applyPenalty, suspendDriver, reassignShift, flagForReview,
//      createTrainingTask, recordCashSettlement, escalateToHumanSupervisor,
//      generatePayrollAdjustment.
//   2. PHASE_2_LIVE_TOOLS Set is unchanged (still draftCourierMessage only)
//      — backwards compat.
//   3. projectPendingAction sets toolIsLive=true when
//      PHASE_2_LIVE_TOOLS.has(name) OR PHASE_8_LIVE_TOOLS.has(name).
//   4. Unknown tool name -> toolIsLive=false (defensive default).

import {
  PHASE_2_LIVE_TOOLS,
  PHASE_8_LIVE_TOOLS,
  projectPendingAction,
} from "../../services/decisions/cardProjector";
import { prisma } from "../mocks/config";

const TENANT = "tenant-A";

const PHASE_8_TOOL_NAMES = [
  "draftCourierMessage",
  "sendCourierMessage",
  "applyPenalty",
  "suspendDriver",
  "reassignShift",
  "flagForReview",
  "createTrainingTask",
  "recordCashSettlement",
  "escalateToHumanSupervisor",
  "generatePayrollAdjustment",
] as const;

const basePending = {
  id: "pa-1",
  tenantId: TENANT,
  runId: "run-1",
  agentId: "monitor",
  toolName: "applyPenalty",
  input: { driverId: "drv_xy12" },
  recommendation: "approve",
  reasoning: "test",
  confidence: 0.9,
  priorityScore: 0.7,
  subjectType: "Driver",
  subjectId: "drv_xy12",
  resolvedAt: null,
  resolution: null,
  overrideReason: null,
  createdAt: new Date("2026-05-09T06:31:00Z"),
};

describe("Phase 8 / REQ-agent-action-tools: PHASE_8_LIVE_TOOLS projection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.driver.findFirst as jest.Mock).mockResolvedValue({
      id: "drv_xy12",
      tenantId: TENANT,
      name: "Mohamed",
    });
  });

  test("PHASE_8_LIVE_TOOLS contains exactly the 10 Phase-8 live tool names", () => {
    const actual = [...PHASE_8_LIVE_TOOLS].sort();
    const expected = [...PHASE_8_TOOL_NAMES].sort();
    expect(actual).toEqual(expected);
    expect(PHASE_8_LIVE_TOOLS.size).toBe(10);
  });

  test("PHASE_2_LIVE_TOOLS is unchanged — still contains only draftCourierMessage", () => {
    expect([...PHASE_2_LIVE_TOOLS]).toEqual(["draftCourierMessage"]);
  });

  test("projectPendingAction sets toolIsLive=true when PHASE_2 or PHASE_8 contains the tool name", async () => {
    for (const name of PHASE_8_TOOL_NAMES) {
      const card = await projectPendingAction(
        { ...basePending, toolName: name },
        { tenantId: TENANT },
      );
      expect(card.toolIsLive).toBe(true);
    }
  });

  test("projectPendingAction sets toolIsLive=false for an unknown tool name (defensive default)", async () => {
    const card = await projectPendingAction(
      { ...basePending, toolName: "unknownTool" },
      { tenantId: TENANT },
    );
    expect(card.toolIsLive).toBe(false);
  });
});

// RED — turned GREEN by Wave 2 (cardProjector PHASE_8_LIVE_TOOLS export).
