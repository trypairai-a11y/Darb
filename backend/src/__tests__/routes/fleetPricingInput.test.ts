// Client note, 2026-10-15 (Osama): saving a delivery company's pricing
// answered "Validation failed". Hand-typed amounts are now read leniently.

import { normaliseKwdInput } from "../../routes/fleets";

describe("normaliseKwdInput", () => {
  test.each([
    ["1.250", "1.250"],
    [" 1.250 ", "1.250"],
    ["١٫٢٥٠", "1.250"],
    ["۱.۵", "1.5"],
    ["1,5", "1.5"],
    [".75", "0.75"],
    ["1.100 KD", "1.100"],
    ["1.1000", "1.100"],
    ["", null],
    ["   ", null],
  ])("%p reads as %p", (input, expected) => {
    expect(normaliseKwdInput(input)).toBe(expected);
  });

  test("numbers and null pass through untouched", () => {
    expect(normaliseKwdInput(1.5)).toBe(1.5);
    expect(normaliseKwdInput(null)).toBe(null);
  });
});
