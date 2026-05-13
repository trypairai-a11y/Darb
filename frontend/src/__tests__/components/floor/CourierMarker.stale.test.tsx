/**
 * Phase 7 Wave 0 RED test — <CourierMarker/> dot color + ring logic.
 *
 * The map's marker icon is a coloured dot whose colour encodes the
 * courier's status:
 *
 *   Online + fresh GPS + has orders today  -> bg-emerald-500 (working)
 *   Online + fresh GPS + no orders         -> bg-sand-400    (idle)
 *   Online + GPS > 10min stale             -> bg-red-500     (stale)
 *   Offline + scheduled shift in past      -> bg-blue-500    (scheduled-not-online)
 *
 * The dot also carries a platform-coloured ring:
 *   KEETA      -> ring-keeta
 *   TALABAT    -> ring-talabat
 *   DELIVEROO  -> ring-deliveroo
 *   AMERICANA  -> ring-americana
 *
 * isStale is computed as: Date.now() - lastGpsAt > 10 * 60_000.
 *
 * REQ-floor-live-map.
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";

// RED: import fails today — Wave 2 ships the marker.
import CourierMarker from "@/components/floor/CourierMarker";

const NOW = new Date("2026-05-13T14:00:00.000Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Phase 7 / <CourierMarker/> dot color + ring logic (RED — flips GREEN in Wave 2)", () => {
  it("component is exported from @/components/floor/CourierMarker", () => {
    expect(CourierMarker).toBeDefined();
  });

  it("STATE.STALE: lastGpsAt 15 min ago renders 'bg-red-500'", () => {
    const lastGpsAt = new Date(NOW - 15 * 60 * 1000).toISOString();
    const { container } = render(
      <CourierMarker
        courier={{
          driverId: "d1",
          name: "Test",
          phone: "x",
          platform: "KEETA",
          vehicleType: "MOTORCYCLE",
          area: "Hawally",
          lat: 29.3,
          lng: 47.9,
          lastGpsAt,
          isOnline: true,
          todayStats: { ordersDelivered: 8, ordersRejected: 0, onlineMinutes: 90 },
        }}
      />,
    );
    expect(container.innerHTML).toMatch(/bg-red-500/);
  });

  it("STATE.WORKING: fresh GPS + ordersDelivered>0 renders 'bg-emerald-500'", () => {
    const lastGpsAt = new Date(NOW - 2 * 60 * 1000).toISOString();
    const { container } = render(
      <CourierMarker
        courier={{
          driverId: "d2",
          name: "Test",
          phone: "x",
          platform: "TALABAT",
          vehicleType: "CAR",
          area: "Salmiya",
          lat: 29.3,
          lng: 47.9,
          lastGpsAt,
          isOnline: true,
          todayStats: { ordersDelivered: 5, ordersRejected: 0, onlineMinutes: 100 },
        }}
      />,
    );
    expect(container.innerHTML).toMatch(/bg-emerald-500/);
  });

  it("STATE.IDLE: fresh GPS + ordersDelivered=0 renders 'bg-sand-400'", () => {
    const lastGpsAt = new Date(NOW - 2 * 60 * 1000).toISOString();
    const { container } = render(
      <CourierMarker
        courier={{
          driverId: "d3",
          name: "Test",
          phone: "x",
          platform: "AMERICANA",
          vehicleType: "CAR",
          area: "Jabriya",
          lat: 29.3,
          lng: 47.9,
          lastGpsAt,
          isOnline: true,
          todayStats: { ordersDelivered: 0, ordersRejected: 0, onlineMinutes: 60 },
        }}
      />,
    );
    expect(container.innerHTML).toMatch(/bg-sand-400/);
  });

  it("STATE.SCHEDULED_NOT_ONLINE: isOnline=false + scheduledShiftStart in past renders 'bg-blue-500'", () => {
    const { container } = render(
      <CourierMarker
        courier={{
          driverId: "d4",
          name: "Test",
          phone: "x",
          platform: "DELIVEROO",
          vehicleType: "MOTORCYCLE",
          area: "Hawally",
          lat: 29.3,
          lng: 47.9,
          lastGpsAt: null,
          isOnline: false,
          scheduledShiftStart: new Date(NOW - 30 * 60 * 1000).toISOString(),
        } as any}
      />,
    );
    expect(container.innerHTML).toMatch(/bg-blue-500/);
  });

  it("KEETA platform renders ring-keeta class", () => {
    const lastGpsAt = new Date(NOW - 2 * 60 * 1000).toISOString();
    const { container } = render(
      <CourierMarker
        courier={{
          driverId: "d5",
          name: "K",
          phone: "x",
          platform: "KEETA",
          vehicleType: "MOTORCYCLE",
          area: "Hawally",
          lat: 29.3,
          lng: 47.9,
          lastGpsAt,
          isOnline: true,
          todayStats: { ordersDelivered: 1 },
        }}
      />,
    );
    expect(container.innerHTML).toMatch(/ring-keeta/);
  });

  it("TALABAT platform renders ring-talabat class", () => {
    const lastGpsAt = new Date(NOW - 2 * 60 * 1000).toISOString();
    const { container } = render(
      <CourierMarker
        courier={{
          driverId: "d6",
          name: "T",
          phone: "x",
          platform: "TALABAT",
          vehicleType: "CAR",
          area: "Salmiya",
          lat: 29.3,
          lng: 47.9,
          lastGpsAt,
          isOnline: true,
          todayStats: { ordersDelivered: 1 },
        }}
      />,
    );
    expect(container.innerHTML).toMatch(/ring-talabat/);
  });

  it("DELIVEROO platform renders ring-deliveroo class", () => {
    const lastGpsAt = new Date(NOW - 2 * 60 * 1000).toISOString();
    const { container } = render(
      <CourierMarker
        courier={{
          driverId: "d7",
          name: "D",
          phone: "x",
          platform: "DELIVEROO",
          vehicleType: "MOTORCYCLE",
          area: "Jabriya",
          lat: 29.3,
          lng: 47.9,
          lastGpsAt,
          isOnline: true,
          todayStats: { ordersDelivered: 1 },
        }}
      />,
    );
    expect(container.innerHTML).toMatch(/ring-deliveroo/);
  });

  it("AMERICANA platform renders ring-americana class", () => {
    const lastGpsAt = new Date(NOW - 2 * 60 * 1000).toISOString();
    const { container } = render(
      <CourierMarker
        courier={{
          driverId: "d8",
          name: "A",
          phone: "x",
          platform: "AMERICANA",
          vehicleType: "MOTORCYCLE",
          area: "Avenues",
          lat: 29.3,
          lng: 47.9,
          lastGpsAt,
          isOnline: true,
          todayStats: { ordersDelivered: 1 },
        }}
      />,
    );
    expect(container.innerHTML).toMatch(/ring-americana/);
  });
});

// RED — turned GREEN by Wave 2
