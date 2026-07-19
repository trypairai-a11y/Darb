/**
 * formatKwd — KWD money rendering, always "KD X.XXX" (3dp, fils precision).
 */

import { formatClock, formatDuration, formatKwd } from "../src/i18n/format";

describe("formatKwd", () => {
  test("renders 3 decimal places with KD prefix", () => {
    expect(formatKwd(12.5)).toBe("KD 12.500");
    expect(formatKwd(0.75)).toBe("KD 0.750");
    expect(formatKwd(3)).toBe("KD 3.000");
  });

  test("accepts backend 3dp string decimals", () => {
    expect(formatKwd("1.250")).toBe("KD 1.250");
    expect(formatKwd("100.000")).toBe("KD 100.000");
  });

  test("null/undefined/NaN degrade to KD 0.000", () => {
    expect(formatKwd(null)).toBe("KD 0.000");
    expect(formatKwd(undefined)).toBe("KD 0.000");
    expect(formatKwd("not-a-number")).toBe("KD 0.000");
  });

  test("rounds beyond-fils precision", () => {
    expect(formatKwd(1.2345)).toBe("KD 1.234"); // toFixed banker-free rounding
    expect(formatKwd(1.9996)).toBe("KD 2.000");
  });
});

describe("formatDuration / formatClock", () => {
  test("formatDuration renders human spans", () => {
    expect(formatDuration(27_000)).toBe("27s");
    expect(formatDuration(267_000)).toBe("4m 27s");
    expect(formatDuration(3_840_000)).toBe("1h 04m");
  });

  test("formatClock renders mm:ss and clamps at 0", () => {
    expect(formatClock(95_000)).toBe("1:35");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-5_000)).toBe("0:00");
  });
});
