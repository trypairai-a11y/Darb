/**
 * Phase 7 Wave 0 RED test — <FloorPillCounters/>.
 *
 * Three pill counters anchor the Live Floor header:
 *   - Scheduled-not-online (couriers with a Shift but no
 *     CourierOnlineSession row)
 *   - GPS-stale (lastGpsAt > 10 minutes ago)
 *   - Order-rejection (rejectedAuto >= 3 today, Keeta canonical signal)
 *
 * Resolution #2 (from RESEARCH): clicking a pill MUST both apply the
 * filter (onFilterChange) AND open the corresponding list view
 * (onListOpen) — both behaviours, not either/or.
 *
 * NIT1 — the component is data-driven over a 3-element array (not a
 * hard-coded JSX block of three elements). Test asserts the array
 * surfaces all three pills with consistent props.
 *
 * REQ-floor-live-map.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { FLOOR_COUNTERS } from "@/__tests__/fixtures/floorCouriers";

// RED: import fails today.
import FloorPillCounters from "@/components/floor/FloorPillCounters";

describe("Phase 7 / <FloorPillCounters/> (RED — flips GREEN in Wave 3)", () => {
  it("component is exported from @/components/floor/FloorPillCounters", () => {
    expect(FloorPillCounters).toBeDefined();
  });

  it("renders three pills labeled 'Scheduled-not-online', 'GPS-stale', 'Order-rejection' with counts from props", () => {
    const { container } = render(
      <FloorPillCounters counters={FLOOR_COUNTERS} />,
    );
    const text = container.textContent ?? "";
    expect(text).toMatch(/Scheduled[- ]?not[- ]?online/i);
    expect(text).toMatch(/GPS[- ]?stale/i);
    expect(text).toMatch(/Order[- ]?rejection/i);
    expect(text).toContain(String(FLOOR_COUNTERS.scheduledNotOnline));
    expect(text).toContain(String(FLOOR_COUNTERS.gpsStale));
    expect(text).toContain(String(FLOOR_COUNTERS.orderRejection));
  });

  it("NIT1: pills are rendered from an array (data-driven), not three hard-coded blocks — each pill carries a stable data-pill-key", () => {
    const { container } = render(
      <FloorPillCounters counters={FLOOR_COUNTERS} />,
    );
    const pills = container.querySelectorAll("[data-pill-key]");
    expect(pills.length).toBe(3);
    const keys = Array.from(pills).map((p) => p.getAttribute("data-pill-key"));
    expect(keys).toEqual(
      expect.arrayContaining([
        "SCHEDULED_NOT_ONLINE",
        "GPS_STALE",
        "ORDER_REJECTION",
      ]),
    );
  });

  it("clicking a pill fires BOTH onFilterChange AND onListOpen (resolution #2)", () => {
    const onFilterChange = vi.fn();
    const onListOpen = vi.fn();
    const { container } = render(
      <FloorPillCounters
        counters={FLOOR_COUNTERS}
        onFilterChange={onFilterChange}
        onListOpen={onListOpen}
      />,
    );
    const pill = container.querySelector('[data-pill-key="SCHEDULED_NOT_ONLINE"]')!;
    fireEvent.click(pill);
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: "SCHEDULED_NOT_ONLINE" }),
    );
    expect(onListOpen).toHaveBeenCalledWith(
      expect.objectContaining({ filter: "SCHEDULED_NOT_ONLINE" }),
    );
  });

  it("active filter pill renders with aria-pressed=true (or a similar active-state marker)", () => {
    const { container } = render(
      <FloorPillCounters
        counters={FLOOR_COUNTERS}
        activeFilter="GPS_STALE"
      />,
    );
    const active = container.querySelector('[data-pill-key="GPS_STALE"]');
    expect(active?.getAttribute("aria-pressed")).toBe("true");
  });

  it("zero-count pill renders dimmed / disabled (visual affordance)", () => {
    const { container } = render(
      <FloorPillCounters
        counters={{ scheduledNotOnline: 0, gpsStale: 0, orderRejection: 0 }}
      />,
    );
    const pills = container.querySelectorAll("[data-pill-key]");
    pills.forEach((p) => {
      // Either disabled attribute OR aria-disabled OR opacity class.
      const isMuted =
        p.hasAttribute("disabled") ||
        p.getAttribute("aria-disabled") === "true" ||
        (p.getAttribute("class") ?? "").match(/opacity|disabled|muted|dim/i);
      expect(!!isMuted).toBe(true);
    });
  });

  it("RTL-safe: text content uses neutral tokens (no Arabic in v1 owner UI per RESEARCH)", () => {
    const { container } = render(
      <FloorPillCounters counters={FLOOR_COUNTERS} />,
    );
    // No Arabic glyphs in the rendered text (v1 owner UI is English-only).
    expect(container.textContent ?? "").not.toMatch(/[؀-ۿ]/);
  });
});

// RED — turned GREEN by Wave 3
