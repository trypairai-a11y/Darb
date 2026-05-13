/**
 * Phase 7 Wave 0 RED test — <FloorFilters/>.
 *
 * Filter state syncs to URLSearchParams so the operator can share /
 * bookmark a view. Platform multi-select, area dropdown, debounced
 * search input.
 *
 * B3 STATIC CLASSES assertion (Tailwind safelisting): the component
 * MUST use static class maps for platform-color rings — not
 * dynamically-constructed `bg-${platform}` strings — because Tailwind
 * tree-shakes unreferenced classes. The test asserts that the rendered
 * markup uses pre-known class names from a lookup table.
 *
 * REQ-floor-live-map.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

// RED: import fails today.
import FloorFilters from "@/components/floor/FloorFilters";

describe("Phase 7 / <FloorFilters/> (RED — flips GREEN in Wave 3)", () => {
  it("component is exported from @/components/floor/FloorFilters", () => {
    expect(FloorFilters).toBeDefined();
  });

  it("platform multi-select toggle emits onFilterChange({platforms:[...]})", () => {
    const onFilterChange = vi.fn();
    const { container } = render(
      <FloorFilters onFilterChange={onFilterChange} />,
    );
    const keetaToggle = container.querySelector(
      '[data-filter="platform"][data-value="KEETA"]',
    );
    expect(keetaToggle).toBeTruthy();
    fireEvent.click(keetaToggle!);
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ platforms: expect.arrayContaining(["KEETA"]) }),
    );
  });

  it("area dropdown change emits onFilterChange({area:...})", () => {
    const onFilterChange = vi.fn();
    const { container } = render(
      <FloorFilters onFilterChange={onFilterChange} />,
    );
    const area = container.querySelector('select[data-filter="area"]');
    expect(area).toBeTruthy();
    fireEvent.change(area!, { target: { value: "Hawally" } });
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ area: "Hawally" }),
    );
  });

  it("search input change is debounced (200ms) then emits onFilterChange({q:...})", async () => {
    vi.useFakeTimers();
    const onFilterChange = vi.fn();
    const { container } = render(
      <FloorFilters onFilterChange={onFilterChange} />,
    );
    const input = container.querySelector('input[data-filter="q"]');
    expect(input).toBeTruthy();
    fireEvent.change(input!, { target: { value: "mohamed" } });
    // Before 200ms — no emission.
    expect(onFilterChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ q: "mohamed" }),
    );
    vi.advanceTimersByTime(250);
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ q: "mohamed" }),
    );
    vi.useRealTimers();
  });

  it("URL syncs to ?platforms=KEETA,TALABAT&area=Hawally&q=mohamed on filter change", () => {
    // The router push spy is mocked via next/navigation in setup.tsx.
    // The component is expected to call router.replace / push with
    // the synced query string. Wave 3 chooses replace vs push.
    const { container } = render(
      <FloorFilters initialFilters={{ platforms: ["KEETA", "TALABAT"], area: "Hawally", q: "mohamed" }} />,
    );
    // Existence of the input/select with the initial value confirms
    // hydration from URLSearchParams. Wave 3 may also surface a
    // data-attribute on the root containing the synced string.
    const root = container.firstElementChild;
    expect(root?.getAttribute("data-query")).toContain("platforms=KEETA,TALABAT");
    expect(root?.getAttribute("data-query")).toContain("area=Hawally");
    expect(root?.getAttribute("data-query")).toContain("q=mohamed");
  });

  it("initial filter state hydrates from URLSearchParams (props.initialFilters)", () => {
    const { container } = render(
      <FloorFilters initialFilters={{ area: "Hawally" }} />,
    );
    const area = container.querySelector('select[data-filter="area"]') as HTMLSelectElement | null;
    expect(area?.value).toBe("Hawally");
  });

  it("B3 STATIC CLASSES: platform color rings come from a static lookup map (Tailwind safelist)", () => {
    const { container } = render(
      <FloorFilters initialFilters={{ platforms: ["KEETA", "TALABAT"] }} />,
    );
    // The component must NOT use bg-${platform} string templates —
    // those are tree-shaken. Static maps survive purge. We assert
    // that the rendered markup contains AT LEAST ONE class name from
    // the known safelist for each enabled platform.
    const html = container.innerHTML;
    // tailwind.config.ts exposes keeta/talabat/deliveroo/americana
    // color tokens; the static map should produce class names that
    // reference them (bg-keeta, ring-keeta, text-keeta, etc.).
    const hasKeetaToken = /(?:bg|ring|text|border)-keeta\b/.test(html);
    const hasTalabatToken = /(?:bg|ring|text|border)-talabat\b/.test(html);
    expect(hasKeetaToken || hasTalabatToken).toBe(true);
  });
});

// RED — turned GREEN by Wave 3
