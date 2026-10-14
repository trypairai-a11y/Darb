// Revision 24 #12: the Orders search box started a fresh query on every
// keystroke. The query now reads this debounced value instead.
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

afterEach(() => vi.useRealTimers());

describe("useDebouncedValue", () => {
  it("holds the value until typing pauses", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), { initialProps: { v: "" } });
    rerender({ v: "D" });
    rerender({ v: "DR" });
    rerender({ v: "DRB" });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("");
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("DRB");
  });
});
