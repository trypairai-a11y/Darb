/**
 * Phase 7 Wave 0 RED test — <CourierDetailPanel/> composition.
 *
 * Resolution #5 (from RESEARCH): the panel renders
 *   DriverLink + score chip + last 5 OrderEvents +
 *   AskDarbWhyDrawer + PingButton
 * wrapped in a SlidePanel that opens when props.driverId is set.
 *
 * B4 SATISFIES-SHAPE assertion: AskDarbWhyDrawer takes a
 * `preWarmed: DriverFileScoreExplanation` prop. The panel must pass a
 * value that "satisfies" the explanation shape (text, cached) — Wave
 * 3 will hydrate from the pre-warmed bulk endpoint. The test asserts
 * the panel writes a non-empty preWarmed prop, even if it's a
 * placeholder shape today.
 *
 * REQ-floor-live-map.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { FLOOR_COURIER_FIXTURE } from "@/__tests__/fixtures/floorCouriers";

// Mock dependencies the panel composes.
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(async () => ({ data: { text: "Loading...", cached: false } })),
    post: vi.fn(async () => ({ data: {} })),
  },
  getAccessToken: () => "test-token",
}));

vi.mock("@/components/shared/DriverLink", () => ({
  default: ({ driverId, name }: any) => (
    <a data-testid="driver-link" data-driver-id={driverId} href={`/drivers/${driverId}`}>
      {name}
    </a>
  ),
}));

vi.mock("@/components/shared/SlidePanel", () => ({
  default: ({ open, onClose, title, children }: any) =>
    open ? (
      <div data-testid="slide-panel" data-title={title}>
        <button data-testid="slide-panel-close" onClick={onClose}>
          Close
        </button>
        {children}
      </div>
    ) : null,
}));

vi.mock("@/components/driver-file/AskDarbWhyDrawer", () => ({
  default: ({ driverId, preWarmed }: any) => (
    <div
      data-testid="ask-darb-why-drawer"
      data-driver-id={driverId}
      data-prewarmed={JSON.stringify(preWarmed)}
    />
  ),
}));

// RED: imports below fail today — Wave 3 ships these components.
import CourierDetailPanel from "@/components/floor/CourierDetailPanel";

describe("Phase 7 / <CourierDetailPanel/> (RED — flips GREEN in Wave 3)", () => {
  const courier = FLOOR_COURIER_FIXTURE[0]; // drv-keeta-1

  it("component is exported from @/components/floor/CourierDetailPanel", () => {
    expect(CourierDetailPanel).toBeDefined();
  });

  it("SlidePanel open=true when props.driverId is set", () => {
    const { queryByTestId } = render(
      <CourierDetailPanel courier={courier} onClose={() => {}} />,
    );
    expect(queryByTestId("slide-panel")).toBeTruthy();
  });

  it("renders DriverLink for the selected courier", () => {
    const { getByTestId } = render(
      <CourierDetailPanel courier={courier} onClose={() => {}} />,
    );
    const link = getByTestId("driver-link");
    expect(link.getAttribute("data-driver-id")).toBe(courier.driverId);
    expect(link.textContent).toContain(courier.name);
  });

  it("renders a score chip somewhere in the panel", () => {
    const { container } = render(
      <CourierDetailPanel courier={courier} onClose={() => {}} />,
    );
    // The chip exposes a stable test-id OR contains a 0-100 numeric score.
    const chip = container.querySelector('[data-testid="courier-score-chip"]');
    expect(chip).toBeTruthy();
  });

  it("renders the last 5 OrderEvents section", () => {
    const { container } = render(
      <CourierDetailPanel courier={courier} onClose={() => {}} />,
    );
    const list = container.querySelector('[data-testid="recent-order-events"]');
    expect(list).toBeTruthy();
  });

  it("renders AskDarbWhyDrawer with a pre-warmed prop satisfying the explanation shape (B4)", () => {
    const { getByTestId } = render(
      <CourierDetailPanel courier={courier} onClose={() => {}} />,
    );
    const drawer = getByTestId("ask-darb-why-drawer");
    expect(drawer.getAttribute("data-driver-id")).toBe(courier.driverId);
    const preWarmedJson = drawer.getAttribute("data-prewarmed");
    expect(preWarmedJson).toBeTruthy();
    const preWarmed = JSON.parse(preWarmedJson!);
    // satisfies DriverFileScoreExplanation: { text: string; cached: boolean }
    expect(typeof preWarmed.text).toBe("string");
    expect(typeof preWarmed.cached).toBe("boolean");
  });

  it("renders PingButton with intent inferred from the current pill signal", () => {
    const { container } = render(
      <CourierDetailPanel
        courier={courier}
        onClose={() => {}}
        pillSignal="GPS_STALE"
      />,
    );
    const ping = container.querySelector('[data-testid="ping-button"]');
    expect(ping).toBeTruthy();
    expect(ping?.getAttribute("data-intent")).toBe("WARN_GPS_STALE");
  });

  it("close button calls props.onClose without resetting parent map state", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(
      <CourierDetailPanel courier={courier} onClose={onClose} />,
    );
    (getByTestId("slide-panel-close") as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });
});

// RED — turned GREEN by Wave 3
