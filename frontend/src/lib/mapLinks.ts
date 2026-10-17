// Client note (Osama, 15 Oct 2026): "the order map must show the route the
// driver took and the store + customer location, must be able to copy the
// link". Google Maps links built from the pins on an order, and a copy helper
// that still works where the async clipboard API does not.

export interface LatLng {
  lat: number;
  lng: number;
}

function coord(p: LatLng): string {
  // Seven decimals is what the database keeps; more is noise in a URL.
  return `${Number(p.lat.toFixed(7))},${Number(p.lng.toFixed(7))}`;
}

/** A Google Maps link that drops a pin on one place. */
export function googleMapsPlaceUrl(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${coord(p)}`;
}

/** Google Maps directions from the store to the customer. */
export function googleMapsDirectionsUrl(origin: LatLng, destination: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${coord(origin)}&destination=${coord(destination)}`;
}

/**
 * Copies `text`. Tries the async clipboard API, then the old execCommand path
 * (which works on plain http and inside some embedded browsers), and answers
 * false when neither did, so the caller can show the link for a manual copy.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or insecure context: fall through to execCommand.
  }
  try {
    if (typeof document === "undefined") return false;
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = typeof document.execCommand === "function" && document.execCommand("copy");
    document.body.removeChild(area);
    return !!ok;
  } catch {
    return false;
  }
}
