// Darb 2.0 — tiny client-side CSV builder + download trigger (wave 2).
// Mirrors the escaping rules of DataTable's inline export so files open the
// same way in Excel/Numbers regardless of which surface produced them.

function escapeCell(cell: unknown): string {
  if (cell == null) return '""';
  return `"${String(cell).replace(/"/g, '""')}"`;
}

/** Build a CSV string from a header row + data rows. */
export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers.map(escapeCell).join(","), ...rows.map((r) => r.map(escapeCell).join(","))].join(
    "\n"
  );
}

/** Trigger a browser download of the given rows as `{filename}-YYYY-MM-DD.csv`. */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const blob = new Blob([buildCsv(headers, rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
