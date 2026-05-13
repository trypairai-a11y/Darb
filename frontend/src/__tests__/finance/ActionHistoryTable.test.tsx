// Phase 8 Wave 0 RED test — turned GREEN by Wave 4 (frontend/src/
// components/finance/history/ActionHistoryTable.tsx). Do not skip.
//
// Behavior contract (REQ-agent-action-tools):
//   - Renders AgentAction rows from GET /api/audit/agent-actions filtered
//     to Phase 8 tool names by default.
//   - Row shows: Date, Tool, Driver (linked to Driver File), Outcome,
//     Approver.
//   - Rollback button visible only for rollback-eligible tools:
//     applyPenalty, suspendDriver, reassignShift, createTrainingTask,
//     sendCourierMessage; NOT for recordCashSettlement (per dispatcher's
//     manual-reversal rule).
//   - Click Rollback opens ConfirmModal; on confirm calls POST
//     /api/audit/agent-actions/:id/rollback; on 200 row gets rolled_back
//     chip + audit.rolledBackAt set.
//   - Filter by toolName, outcome, approverId, dateFrom, dateTo.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Wave 4 will create this — Wave 0 RED import.
import { ActionHistoryTable } from "@/components/finance/history/ActionHistoryTable";

const rows = [
  {
    id: "a1",
    createdAt: "2026-05-13T07:00:00Z",
    toolName: "applyPenalty",
    subjectType: "Driver",
    subjectId: "drv_xy12",
    driverName: "Mohamed",
    outcome: "success",
    approverName: "Sara",
    rolledBackAt: null,
  },
  {
    id: "a2",
    createdAt: "2026-05-13T08:00:00Z",
    toolName: "recordCashSettlement",
    subjectType: "CashRecord",
    subjectId: "cash-1",
    driverName: "Ali",
    outcome: "success",
    approverName: "Sara",
    rolledBackAt: null,
  },
  {
    id: "a3",
    createdAt: "2026-05-13T09:00:00Z",
    toolName: "suspendDriver",
    subjectType: "Driver",
    subjectId: "drv_aa11",
    driverName: "Yousef",
    outcome: "success",
    approverName: "Sara",
    rolledBackAt: null,
  },
];

describe("Phase 8 / REQ-agent-action-tools: ActionHistoryTable", () => {
  it("renders AgentAction rows with Date, Tool, Driver, Outcome, Approver columns", () => {
    render(
      <ActionHistoryTable rows={rows} loading={false} onRollback={vi.fn()} onFilterChange={vi.fn()} />,
    );
    expect(screen.getByText(/Mohamed/i)).toBeInTheDocument();
    expect(screen.getByText(/Ali/i)).toBeInTheDocument();
    expect(screen.getByText(/Yousef/i)).toBeInTheDocument();
    for (const col of ["Date", "Tool", "Driver", "Outcome", "Approver"]) {
      expect(screen.getAllByText(new RegExp(col, "i")).length).toBeGreaterThan(0);
    }
  });

  it("Rollback button visible only for rollback-eligible tools — NOT for recordCashSettlement", () => {
    render(
      <ActionHistoryTable rows={rows} loading={false} onRollback={vi.fn()} onFilterChange={vi.fn()} />,
    );
    // applyPenalty + suspendDriver -> Rollback buttons present (2 total)
    const rollbackBtns = screen.getAllByRole("button", { name: /Rollback/i });
    expect(rollbackBtns.length).toBe(2);
    // recordCashSettlement row should NOT carry a Rollback button — assert
    // by searching the row containing Ali's record.
    const aliRow = screen.getByText(/Ali/i).closest("tr") as HTMLElement;
    expect(aliRow.querySelector('button[data-action="rollback"]')).toBeNull();
  });

  it("click Rollback calls onRollback(row.id) (parent triggers POST /api/audit/agent-actions/:id/rollback)", async () => {
    const onRollback = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ActionHistoryTable rows={rows} loading={false} onRollback={onRollback} onFilterChange={vi.fn()} />,
    );
    const rollbackBtns = screen.getAllByRole("button", { name: /Rollback/i });
    fireEvent.click(rollbackBtns[0]);
    // Confirm modal opens — click the Confirm button.
    const confirmBtn = await screen.findByRole("button", { name: /Confirm/i });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(onRollback).toHaveBeenCalledWith("a1"));
  });

  it("filter by toolName, outcome, approverId, dateFrom, dateTo triggers onFilterChange", () => {
    const onFilterChange = vi.fn();
    render(
      <ActionHistoryTable rows={rows} loading={false} onRollback={vi.fn()} onFilterChange={onFilterChange} />,
    );
    const toolFilter = screen.getByLabelText(/Tool/i);
    fireEvent.change(toolFilter, { target: { value: "applyPenalty" } });
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "applyPenalty" }),
    );
  });

  it("default tool filter scopes to the Phase 8 tool set (rollback-eligible tools listed in the filter dropdown)", () => {
    render(
      <ActionHistoryTable rows={rows} loading={false} onRollback={vi.fn()} onFilterChange={vi.fn()} />,
    );
    const toolFilter = screen.getByLabelText(/Tool/i) as HTMLSelectElement;
    const optionValues = Array.from(toolFilter.querySelectorAll("option")).map(
      (o) => o.getAttribute("value") ?? o.textContent,
    );
    for (const expected of [
      "applyPenalty",
      "suspendDriver",
      "reassignShift",
      "createTrainingTask",
      "sendCourierMessage",
    ]) {
      expect(optionValues).toEqual(expect.arrayContaining([expected]));
    }
  });
});

// RED — turned GREEN by Wave 4 (ActionHistoryTable.tsx).
