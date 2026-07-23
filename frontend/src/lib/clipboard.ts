// Darb 2.0 — clipboard helpers for the ops control room (client revision #4).
//
// Rider support copies task and courier details out of the dashboard all day
// to paste into WhatsApp, a ticket, or an internal note. The Keeta reference
// calls this "One-click copy irregular info". Everything is copied as
// newline-separated `Label: value` pairs, which paste readably into a chat and
// still split cleanly in a spreadsheet.

/**
 * Copy text to the clipboard. Falls back to a hidden textarea + execCommand on
 * browsers that refuse navigator.clipboard outside a secure context, so this
 * still works over plain http on the office LAN.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Render `Label: value` lines, dropping any pair with no value. */
export function formatCopyBlock(pairs: Array<[string, unknown]>): string {
  return pairs
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}
