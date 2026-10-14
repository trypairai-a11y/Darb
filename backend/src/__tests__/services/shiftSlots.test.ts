/**
 * Revision 24 (#3) — what a bookable slot is.
 *
 * Two things matter here. The peak layout has to cover every hour it is asked
 * to cover with nothing but 2, 3 and 4-hour slots, putting the extra drivers
 * where demand is. And the capacity rows written before slots existed have to
 * keep meaning exactly what they meant: eight three-hour windows, a missing
 * row is no cap, 0 is closed.
 */
import {
  coverageOf,
  layoutSlots,
  minutesBetween,
  needPerHour,
  slotsForDay,
} from "../../services/shiftSlots";

describe("layoutSlots", () => {
  function check(need: number[]) {
    const slots = layoutSlots(need);
    const cover = coverageOf(slots);
    for (let h = 0; h < 24; h++) expect(cover[h]).toBeGreaterThanOrEqual(need[h]!);
    expect(slots.every((s) => [2, 3, 4].includes(s.durationHours))).toBe(true);
    expect(slots.every((s) => s.startHour >= 0 && s.startHour + s.durationHours <= 24)).toBe(true);
    // One slot per start time, which is what the capacity grid's key allows.
    expect(new Set(slots.map((s) => s.startHour)).size).toBe(slots.length);
    return { slots, cover };
  }

  it("tiles a flat day of one driver as six four-hour slots", () => {
    const { slots } = check(Array(24).fill(1));
    expect(slots.map((s) => [s.startHour, s.durationHours])).toEqual([
      [0, 4], [4, 4], [8, 4], [12, 4], [16, 4], [20, 4],
    ]);
  });

  it("stacks short slots on the peaks instead of raising the whole day", () => {
    const need = Array(24).fill(2);
    need[12] = 6; need[13] = 6;
    need[19] = 5; need[20] = 5; need[21] = 5;
    const { cover } = check(need);
    expect(cover[12]).toBe(6);
    expect(cover[20]).toBe(5);
    expect(cover[3]).toBe(2);
    // Driver-hours stay close to what the curve asks for, not 6 x 24.
    const asked = need.reduce((a, b) => a + b, 0);
    const given = cover.reduce((a, b) => a + b, 0);
    expect(given - asked).toBeLessThanOrEqual(4);
  });

  it("covers a lone hour at the end of the day without spilling past midnight", () => {
    const need = Array(24).fill(0);
    need[23] = 2;
    const { slots } = check(need);
    expect(slots).toEqual([{ startHour: 22, durationHours: 2, count: 2 }]);
  });

  it("handles irregular curves", () => {
    check([1, 1, 1, 1, 1, 2, 3, 4, 3, 2, 2, 5, 7, 7, 4, 2, 2, 3, 6, 8, 8, 6, 3, 1]);
    check([0, 0, 3, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 2, 2, 2, 2, 2, 0, 0, 0, 0, 1]);
  });
});

describe("needPerHour", () => {
  it("floors quiet hours at the minimum and caps freak hours", () => {
    const need = needPerHour([0, 3, 100, ...Array(21).fill(0)], 2, 1, 20);
    expect(need.slice(0, 3)).toEqual([1, 2, 20]);
  });
});

describe("slotsForDay", () => {
  it("reads a zone with no rows as the eight uncapped legacy windows", () => {
    const slots = slotsForDay([]);
    expect(slots.map((s) => s.start)).toEqual([
      "01:00", "04:00", "07:00", "10:00", "13:00", "16:00", "19:00", "22:00",
    ]);
    expect(slots.every((s) => s.capacity === null && s.durationMinutes === 180)).toBe(true);
    expect(slots[7]!.end).toBe("01:00");
  });

  it("keeps a legacy grid's meaning: a row caps its window, a missing row does not, 0 closes", () => {
    const slots = slotsForDay([
      { startTime: "10:00", maxDrivers: 3 },
      { startTime: "13:00", maxDrivers: 0, durationMinutes: 180 },
    ]);
    expect(slots).toHaveLength(8);
    expect(slots.find((s) => s.start === "10:00")!.capacity).toBe(3);
    expect(slots.find((s) => s.start === "13:00")!.capacity).toBe(0);
    expect(slots.find((s) => s.start === "16:00")!.capacity).toBeNull();
  });

  it("offers exactly a planned layout's slots, with their own lengths", () => {
    const slots = slotsForDay([
      { startTime: "12:00", maxDrivers: 6, durationMinutes: 120 },
      { startTime: "08:00", maxDrivers: 2, durationMinutes: 240 },
    ]);
    expect(slots).toEqual([
      { start: "08:00", end: "12:00", durationMinutes: 240, capacity: 2 },
      { start: "12:00", end: "14:00", durationMinutes: 120, capacity: 6 },
    ]);
  });
});

describe("minutesBetween", () => {
  it("wraps across midnight", () => {
    expect(minutesBetween("22:00", "01:00")).toBe(180);
    expect(minutesBetween("22:00", "00:00")).toBe(120);
    expect(minutesBetween("07:00", "11:00")).toBe(240);
  });
});
