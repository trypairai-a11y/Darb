import XLSX from "xlsx";

interface AmericanaRow {
  empId: string;
  driverName: string;
  chain: string;
  storeName: string;
  company: string;
  position: string;
  dailyOrders: { [day: string]: number };
  totalOrders: number;
  detectedMonth: Date | null;
}

/**
 * Detect daily columns by matching headers like "1-Feb", "15-Mar", etc.
 * Returns an array of { colIndex, dayOfMonth, monthName }.
 */
function detectDailyColumns(headers: string[]): { index: number; day: number; monthName: string }[] {
  const dailyCols: { index: number; day: number; monthName: string }[] = [];
  const dayPattern = /^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i;

  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || "").trim();
    const match = h.match(dayPattern);
    if (match) {
      dailyCols.push({
        index: i,
        day: parseInt(match[1], 10),
        monthName: match[2],
      });
    }
  }

  return dailyCols;
}

/**
 * Derive the month (as Date, 1st of month) from the daily column headers.
 */
function detectMonth(dailyCols: { day: number; monthName: string }[]): Date | null {
  if (dailyCols.length === 0) return null;

  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  const firstCol = dailyCols[0];
  const monthIdx = monthMap[firstCol.monthName.toLowerCase()];
  if (monthIdx === undefined) return null;

  // Guess the year: use current year, or next year if the month seems in the future
  const now = new Date();
  let year = now.getFullYear();
  // If the detected month is far in the past relative to now, it's still this year's data
  // For safety, just use current year
  return new Date(year, monthIdx, 1);
}

export function parseAmericanaXlsx(buffer: Buffer): AmericanaRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Get raw data as array of arrays to handle positional columns
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (rawData.length < 2) return [];

  const headers: string[] = rawData[0].map((h: any) => (h != null ? String(h).trim() : ""));
  const dailyCols = detectDailyColumns(headers);
  const detectedMonth = detectMonth(dailyCols);

  const results: AmericanaRow[] = [];

  for (let r = 1; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row || row.length === 0) continue;

    // Column mapping (0-indexed):
    // 0: # (row number) - skip
    // 1: Chain
    // 2: Emp ID
    // 3: Driver name
    // 4: (legacy CC column — ignored)
    // 5: Store Name
    // 6: Company
    // 7: Position
    const empId = row[2] != null ? String(row[2]).trim() : "";
    const driverName = row[3] != null ? String(row[3]).trim() : "";

    // Skip empty rows (no empId and no driver name)
    if (!empId && !driverName) continue;

    const chain = row[1] != null ? String(row[1]).trim() : "";
    const storeName = row[5] != null ? String(row[5]).trim() : "";
    const company = row[6] != null ? String(row[6]).trim() : "";
    const position = row[7] != null ? String(row[7]).trim() : "";

    // Build dailyOrders map: {"01": 19, "02": 20, ...}
    const dailyOrders: { [day: string]: number } = {};
    for (const col of dailyCols) {
      const val = row[col.index];
      const numVal = parseFloat(val) || 0;
      const dayKey = String(col.day).padStart(2, "0");
      dailyOrders[dayKey] = numVal;
    }

    // Find "Delivered" column (last column typically)
    let totalOrders = 0;
    const deliveredIdx = headers.findIndex(
      (h) => h.toLowerCase() === "delivered"
    );
    if (deliveredIdx >= 0 && row[deliveredIdx] != null) {
      totalOrders = parseInt(row[deliveredIdx], 10) || 0;
    } else {
      // Fallback: sum daily orders
      totalOrders = Object.values(dailyOrders).reduce((sum, v) => sum + v, 0);
    }

    results.push({
      empId,
      driverName,
      chain,
      storeName,
      company,
      position,
      dailyOrders,
      totalOrders,
      detectedMonth,
    });
  }

  return results;
}
