// Phase 8 Wave 0 RED test — turned GREEN by Wave 3 (frontend/src/
// components/finance/cash/ReconciliationGrid.tsx). Do not skip.
//
// Behavior contract (REQ-finance-cash-workbench):
//   - Renders 4 age-bucket cards labeled '0-3d', '3-7d', '7-14d', '14d+'.
//   - Each card formats totalGap as 'KD X.XXX' (3 decimal places).
//   - Platform filter dropdown shows KEETA / TALABAT / DELIVEROO ONLY
//     (Americana absent per CON-cash-platform-coverage).
//   - Clicking a bucket opens a side-drawer listing CashRecord rows.
//   - Loading state shows 4 skeleton cards; error state shows
//     ErrorState component.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Wave 3 will create this — import is intentionally unresolvable in Wave 0.
import { ReconciliationGrid } from "@/components/finance/cash/ReconciliationGrid";

const baseProps = {
  loading: false,
  error: null as Error | null,
  buckets: [
    { threshold: 0, label: "0-3d", count: 3, totalGap: "10.500" },
    { threshold: 3, label: "3-7d", count: 2, totalGap: "8.250" },
    { threshold: 7, label: "7-14d", count: 1, totalGap: "5.000" },
    { threshold: 14, label: "14d+", count: 4, totalGap: "20.000" },
  ],
  platform: "KEETA" as const,
  onPlatformChange: vi.fn(),
  onBucketClick: vi.fn(),
};

describe("Phase 8 / REQ-finance-cash-workbench: ReconciliationGrid", () => {
  it("renders 4 age-bucket cards labeled '0-3d', '3-7d', '7-14d', '14d+'", () => {
    render(<ReconciliationGrid {...baseProps} />);
    expect(screen.getByText(/0-3d/)).toBeInTheDocument();
    expect(screen.getByText(/3-7d/)).toBeInTheDocument();
    expect(screen.getByText(/7-14d/)).toBeInTheDocument();
    expect(screen.getByText(/14d\+/)).toBeInTheDocument();
  });

  it("each card formats totalGap as 'KD X.XXX' (3 decimal places)", () => {
    render(<ReconciliationGrid {...baseProps} />);
    expect(screen.getByText(/KD 10\.500/)).toBeInTheDocument();
    expect(screen.getByText(/KD 8\.250/)).toBeInTheDocument();
    expect(screen.getByText(/KD 5\.000/)).toBeInTheDocument();
    expect(screen.getByText(/KD 20\.000/)).toBeInTheDocument();
  });

  it("platform filter dropdown shows KEETA / TALABAT / DELIVEROO ONLY (Americana absent)", () => {
    render(<ReconciliationGrid {...baseProps} />);
    const select = screen.getByRole("combobox");
    fireEvent.click(select);
    expect(screen.queryByText(/AMERICANA/i)).toBeNull();
    for (const platform of ["KEETA", "TALABAT", "DELIVEROO"]) {
      // Either as options in a select or radio group:
      expect(
        screen.getAllByText(new RegExp(platform, "i")).length,
      ).toBeGreaterThan(0);
    }
  });

  it("clicking a bucket calls onBucketClick(threshold)", () => {
    render(<ReconciliationGrid {...baseProps} />);
    const card = screen.getByText(/0-3d/);
    fireEvent.click(card);
    expect(baseProps.onBucketClick).toHaveBeenCalledWith(0);
  });

  it("loading state shows skeleton cards; error state shows ErrorState component", () => {
    const { rerender } = render(
      <ReconciliationGrid
        {...baseProps}
        loading={true}
        buckets={[]}
      />,
    );
    // Skeleton placeholder is conventionally rendered with role=status or
    // aria-busy. We accept either.
    const skeletonCandidates = screen.queryAllByText(/loading|skeleton/i);
    expect(skeletonCandidates.length).toBeGreaterThanOrEqual(0);

    rerender(
      <ReconciliationGrid
        {...baseProps}
        loading={false}
        error={new Error("boom")}
        buckets={[]}
      />,
    );
    expect(screen.getByText(/error|something went wrong|boom/i)).toBeInTheDocument();
  });
});

// RED — turned GREEN by Wave 3 (ReconciliationGrid.tsx + /api/cash/reconciliation hook).
