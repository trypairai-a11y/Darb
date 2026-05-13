// Phase 8 Wave 0 RED test — turned GREEN by Wave 3 (frontend/src/
// components/finance/pnl/PnlChart.tsx). Do not skip.
//
// Behavior contract (REQ-finance-expenses-pl):
//   - Renders a Recharts BarChart with month-axis (x-axis) + revenue
//     stack + expense stack + net line.
//   - data prop: { months: [{month, revenue: {KEETA,...}, expenses:
//     {FUEL,...}}]} drives the chart.
//   - Uses Sierra palette tokens — Recharts Cell fill props pull from
//     tailwind theme: revenue stack uses talabat/keeta/primary; expense
//     stack uses sand-300/sand-400/sand-500.
//   - Period toggle (Month / Quarter) re-fetches and re-renders.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock Recharts ResponsiveContainer so jsdom can render a fixed-size chart.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<any>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 800, height: 400 }}>{children}</div>
    ),
  };
});

// Wave 3 will create this — Wave 0 RED import.
import { PnlChart } from "@/components/finance/pnl/PnlChart";

const data = {
  months: [
    {
      month: "2026-04",
      revenue: {
        KEETA: "1000.000",
        TALABAT: "500.000",
        DELIVEROO: "200.000",
        AMERICANA: "100.000",
      },
      expenses: {
        FUEL: "100.000",
        MAINTENANCE: "50.000",
        RENT: "300.000",
        OFFICE_SALARY: "200.000",
        UTILITIES: "30.000",
        OTHER: "10.000",
      },
      net: "1110.000",
    },
  ],
};

describe("Phase 8 / REQ-finance-expenses-pl: PnlChart (Recharts)", () => {
  it("renders a Recharts BarChart with month-axis + revenue/expense stacks + net line", () => {
    const { container } = render(
      <PnlChart data={data} period="month" onPeriodChange={vi.fn()} />,
    );
    // Recharts emits an SVG; assert at least one BarChart-like SVG rendered.
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
    // Component should expose the BarChart node tagged with a known class
    // or test id; we look at the rendered output for the canonical chart
    // shape.
    expect(container.querySelector(".recharts-wrapper, [data-testid='pnl-chart']")).not.toBeNull();
  });

  it("data prop drives the chart — month axis label '2026-04' is present", () => {
    render(<PnlChart data={data} period="month" onPeriodChange={vi.fn()} />);
    expect(screen.getByText(/2026-04/)).toBeInTheDocument();
  });

  it("uses Sierra palette tokens (talabat / keeta / primary / sand-*)", () => {
    const { container } = render(
      <PnlChart data={data} period="month" onPeriodChange={vi.fn()} />,
    );
    // Look for fill attributes referencing the Sierra tokens. Recharts
    // accepts hex/css; the component should pass CSS variables or class
    // names. We check the rendered DOM for any reference to the token
    // names — implementation-detail-soft.
    const html = container.innerHTML;
    expect(html).toMatch(/keeta|talabat|primary|sand-/);
  });

  it("Period toggle (Month / Quarter) calls onPeriodChange", () => {
    const onPeriodChange = vi.fn();
    render(
      <PnlChart
        data={data}
        period="month"
        onPeriodChange={onPeriodChange}
      />,
    );
    const quarterBtn = screen.getByRole("button", { name: /Quarter/i });
    fireEvent.click(quarterBtn);
    expect(onPeriodChange).toHaveBeenCalledWith("quarter");
  });
});

// RED — turned GREEN by Wave 3 (PnlChart.tsx using Recharts).
