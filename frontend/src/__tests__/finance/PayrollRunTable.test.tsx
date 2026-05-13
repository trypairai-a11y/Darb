// Phase 8 Wave 0 RED test — turned GREEN by Wave 3 (frontend/src/
// components/finance/payroll/PayrollRunTable.tsx). Do not skip.
//
// Behavior contract (REQ-finance-payroll):
//   - Renders one row per PayrollLine with columns: Driver, Base (KD),
//     Incentives (KD), Deductions (KD), Net (KD).
//   - All KD amounts render with 3-decimal precision.
//   - Freeze button enabled when run.status=='DRAFT'; disabled otherwise.
//   - Export CSV button enabled when run.status=='FROZEN'; disabled
//     otherwise.
//   - Per-row 'Adjust' button opens a drawer.
//   - Sierra palette: header row bg-sand-100; net column text-primary.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Wave 3 will create this — Wave 0 RED import.
import { PayrollRunTable } from "@/components/finance/payroll/PayrollRunTable";

const lines = [
  {
    id: "ln-1",
    driverId: "drv_xy12",
    driverName: "Mohamed",
    base: "120.000",
    incentives: "10.500",
    deductions: "7.250",
    net: "123.250",
  },
  {
    id: "ln-2",
    driverId: "drv_aa11",
    driverName: "Yousef",
    base: "100.000",
    incentives: "5.000",
    deductions: "0.000",
    net: "105.000",
  },
];

describe("Phase 8 / REQ-finance-payroll: PayrollRunTable", () => {
  it("renders one row per PayrollLine with the 5 columns", () => {
    render(
      <PayrollRunTable
        run={{ id: "run-1", period: "2026-W17", status: "DRAFT" }}
        lines={lines}
        onFreeze={vi.fn()}
        onExport={vi.fn()}
        onAdjust={vi.fn()}
      />,
    );
    expect(screen.getByText(/Mohamed/i)).toBeInTheDocument();
    expect(screen.getByText(/Yousef/i)).toBeInTheDocument();
    for (const col of ["Driver", "Base", "Incentives", "Deductions", "Net"]) {
      expect(screen.getAllByText(new RegExp(col, "i")).length).toBeGreaterThan(0);
    }
  });

  it("all KD amounts render with 3-decimal precision", () => {
    render(
      <PayrollRunTable
        run={{ id: "run-1", period: "2026-W17", status: "DRAFT" }}
        lines={lines}
        onFreeze={vi.fn()}
        onExport={vi.fn()}
        onAdjust={vi.fn()}
      />,
    );
    expect(screen.getByText(/120\.000/)).toBeInTheDocument();
    expect(screen.getByText(/123\.250/)).toBeInTheDocument();
    expect(screen.getByText(/7\.250/)).toBeInTheDocument();
  });

  it("Freeze button enabled when run.status=='DRAFT'; disabled with tooltip otherwise", () => {
    const { rerender } = render(
      <PayrollRunTable
        run={{ id: "run-1", period: "2026-W17", status: "DRAFT" }}
        lines={lines}
        onFreeze={vi.fn()}
        onExport={vi.fn()}
        onAdjust={vi.fn()}
      />,
    );
    const freezeBtn = screen.getByRole("button", { name: /Freeze/i });
    expect(freezeBtn).not.toBeDisabled();

    rerender(
      <PayrollRunTable
        run={{ id: "run-1", period: "2026-W17", status: "FROZEN" }}
        lines={lines}
        onFreeze={vi.fn()}
        onExport={vi.fn()}
        onAdjust={vi.fn()}
      />,
    );
    const freezeBtn2 = screen.getByRole("button", { name: /Freeze/i });
    expect(freezeBtn2).toBeDisabled();
  });

  it("Export CSV button enabled when run.status=='FROZEN'; disabled otherwise", () => {
    const { rerender } = render(
      <PayrollRunTable
        run={{ id: "run-1", period: "2026-W17", status: "DRAFT" }}
        lines={lines}
        onFreeze={vi.fn()}
        onExport={vi.fn()}
        onAdjust={vi.fn()}
      />,
    );
    const exportBtn = screen.getByRole("button", { name: /Export CSV/i });
    expect(exportBtn).toBeDisabled();

    rerender(
      <PayrollRunTable
        run={{ id: "run-1", period: "2026-W17", status: "FROZEN" }}
        lines={lines}
        onFreeze={vi.fn()}
        onExport={vi.fn()}
        onAdjust={vi.fn()}
      />,
    );
    const exportBtn2 = screen.getByRole("button", { name: /Export CSV/i });
    expect(exportBtn2).not.toBeDisabled();
  });

  it("Per-row 'Adjust' button calls onAdjust(line.id)", () => {
    const onAdjust = vi.fn();
    render(
      <PayrollRunTable
        run={{ id: "run-1", period: "2026-W17", status: "DRAFT" }}
        lines={lines}
        onFreeze={vi.fn()}
        onExport={vi.fn()}
        onAdjust={onAdjust}
      />,
    );
    const adjustBtns = screen.getAllByRole("button", { name: /Adjust/i });
    fireEvent.click(adjustBtns[0]);
    expect(onAdjust).toHaveBeenCalledWith("ln-1");
  });

  it("Sierra palette: header row uses bg-sand-100 class; net column uses text-primary", () => {
    const { container } = render(
      <PayrollRunTable
        run={{ id: "run-1", period: "2026-W17", status: "DRAFT" }}
        lines={lines}
        onFreeze={vi.fn()}
        onExport={vi.fn()}
        onAdjust={vi.fn()}
      />,
    );
    expect(container.querySelector(".bg-sand-100")).not.toBeNull();
    expect(container.querySelector(".text-primary")).not.toBeNull();
  });
});

// RED — turned GREEN by Wave 3 (PayrollRunTable.tsx).
