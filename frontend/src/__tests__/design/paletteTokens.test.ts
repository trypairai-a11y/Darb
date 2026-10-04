/**
 * Revision 21 (#5) — every colour token the code uses must exist in the palette.
 *
 * The Finance › Payments "Confirm" button was live for a week and reported as
 * missing: it was `bg-forest-600 text-white`, `forest` was not in
 * tailwind.config.ts, and Tailwind emits nothing for a class it does not know,
 * so the button rendered as white text on nothing. The same gap blanked the
 * ACTIVE badge and the training "Activate the account" button. Nothing in the
 * build catches it, because an unknown class is not an error. This does.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import tailwindConfig from "../../../tailwind.config";

const SRC = path.resolve(__dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__") walk(full, out);
    } else if (/\.(tsx|ts)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Custom ramps this config defines with numbered shades. */
function definedShades(): Map<string, Set<string>> {
  const colors = (tailwindConfig.theme?.extend?.colors ?? {}) as Record<string, unknown>;
  const out = new Map<string, Set<string>>();
  for (const [name, value] of Object.entries(colors)) {
    if (value && typeof value === "object") {
      out.set(name, new Set(Object.keys(value as Record<string, string>)));
    }
  }
  return out;
}

// Ramps the product treats as its own. Tailwind's built-ins (red, amber, sky,
// and so on) are not listed here because they always exist.
const HOUSE_RAMPS = ["forest", "sand", "navy"];

describe("house colour ramps", () => {
  it("defines every shade the components reference", () => {
    const shades = definedShades();
    const pattern = new RegExp(`\\b(?:bg|text|border|ring|from|to|via|divide|placeholder)-(${HOUSE_RAMPS.join("|")})-(\\d{2,3})\\b`, "g");
    const missing = new Set<string>();

    for (const file of walk(SRC)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(pattern)) {
        const [, ramp, shade] = m;
        if (!shades.get(ramp!)?.has(shade!)) missing.add(`${ramp}-${shade} (${path.relative(SRC, file)})`);
      }
    }

    expect([...missing]).toEqual([]);
  });
});
