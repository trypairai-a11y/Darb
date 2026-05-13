// Phase 8 Wave 0 RED test — turned GREEN by Wave 4 (frontend/src/app/
// (dashboard)/finance/layout.tsx ships). Do not skip. The import below
// resolves to a module that Wave 4 will create — Vitest fails with
// module-not-found, which IS the RED state.
//
// Behavior contract (REQ-finance-cash-workbench / Wave 4 layout snippet):
//   - ACCOUNTANT session renders children + LeftRail with 5 nav items
//     (Cash / Payroll / Invoices / Expenses / History).
//   - ADMIN session renders children (Admin can view all finance pages).
//   - OPS_MANAGER session redirects to /decisions.
//   - VIEWER session: layout renders BUT LeftRail action items (Freeze
//     Payroll, Export CSV) are hidden — read-only audit access only.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock the Next.js auth session helper Wave 4 ships.
const getServerSessionMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getServerSession: getServerSessionMock,
}));

// Mock next/navigation redirect — Vitest setup already mocks useRouter,
// we add `redirect` here so the layout's role gate can be asserted.
const redirectMock = vi.fn();
vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<any>("next/navigation");
  return {
    ...actual,
    redirect: (path: string) => {
      redirectMock(path);
      throw new Error(`NEXT_REDIRECT:${path}`);
    },
  };
});

// Wave 4 will create this layout — import is intentionally unresolvable
// in Wave 0 to surface a module-not-found RED state.
import FinanceLayout from "@/app/(dashboard)/finance/layout";

describe("Phase 8 / REQ-finance-cash-workbench: FinanceLayout role gate", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    redirectMock.mockReset();
  });

  it("ACCOUNTANT session renders children + LeftRail with 5 nav items", async () => {
    getServerSessionMock.mockResolvedValue({
      user: { id: "u1", role: "ACCOUNTANT", tenantId: "t1" },
    });
    const ui = await FinanceLayout({ children: <div>child-content</div> });
    render(ui as React.ReactElement);
    expect(screen.getByText(/child-content/i)).toBeInTheDocument();
    for (const label of ["Cash", "Payroll", "Invoices", "Expenses", "History"]) {
      expect(screen.getByText(new RegExp(label, "i"))).toBeInTheDocument();
    }
  });

  it("ADMIN session renders children (Admin can view all finance pages)", async () => {
    getServerSessionMock.mockResolvedValue({
      user: { id: "u2", role: "ADMIN", tenantId: "t1" },
    });
    const ui = await FinanceLayout({ children: <div>admin-content</div> });
    render(ui as React.ReactElement);
    expect(screen.getByText(/admin-content/i)).toBeInTheDocument();
  });

  it("OPS_MANAGER session triggers redirect to /decisions", async () => {
    getServerSessionMock.mockResolvedValue({
      user: { id: "u3", role: "OPS_MANAGER", tenantId: "t1" },
    });
    await expect(
      FinanceLayout({ children: <div /> }),
    ).rejects.toThrow(/NEXT_REDIRECT:\/decisions/);
    expect(redirectMock).toHaveBeenCalledWith("/decisions");
  });

  it("VIEWER session: layout renders BUT action items (Freeze Payroll, Export CSV) are hidden", async () => {
    getServerSessionMock.mockResolvedValue({
      user: { id: "u4", role: "VIEWER", tenantId: "t1" },
    });
    const ui = await FinanceLayout({ children: <div>viewer-content</div> });
    render(ui as React.ReactElement);
    expect(screen.getByText(/viewer-content/i)).toBeInTheDocument();
    expect(screen.queryByText(/Freeze Payroll/i)).toBeNull();
    expect(screen.queryByText(/Export CSV/i)).toBeNull();
  });
});

// RED — turned GREEN by Wave 4 (frontend/src/app/(dashboard)/finance/layout.tsx).
