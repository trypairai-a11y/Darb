/**
 * Equipment item types.
 *
 * These fourteen used to be a Postgres enum, so "add equipment" could only ever
 * restock one of them. They are now just the defaults an ops manager starts
 * from: `itemType` is a slug and anything else they invent is equally valid.
 */
export const ITEM_TYPES: { value: string; label: string }[] = [
  { value: "HELMET", label: "Helmet" },
  { value: "TSHIRT", label: "T-Shirt" },
  { value: "PANTS", label: "Pants" },
  { value: "COOLING_VEST", label: "Cooling Vest" },
  { value: "SAFETY_VEST", label: "Safety Vest" },
  { value: "WATER_BOTTLE", label: "Water Bottle" },
  { value: "GLOVES", label: "Gloves" },
  { value: "SAFETY_KIT", label: "Safety Kit" },
  { value: "BIG_BAG", label: "Big Bag" },
  { value: "SMALL_BAG", label: "Small Bag" },
  { value: "CAP", label: "Cap" },
  { value: "MOBILE_PHONE", label: "Mobile Phone" },
  { value: "SIM_CARD", label: "SIM Card" },
  { value: "PETROL_CARD", label: "Petrol Card" },
];

export const ITEM_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ITEM_TYPES.map((i) => [i.value, i.label])
);

/** Mirrors `toItemSlug` on the backend: "Rain jacket" and "rain-jacket" are one pool. */
export function toItemSlug(raw: string): string {
  return String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/** Display name for a row: its own label, then the built-in map, then the slug prettified. */
export function itemDisplayName(itemType?: string | null, label?: string | null): string {
  if (label && label.trim()) return label.trim();
  if (!itemType) return "n/a";
  if (ITEM_TYPE_LABELS[itemType]) return ITEM_TYPE_LABELS[itemType];
  return itemType
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}
