import XLSX from "xlsx";
import { parseAmericanaXlsx } from "./americanaXlsxParser";

export interface AmericanaDailyRow {
  empId: string;
  driverName: string;
  chain: string;
  storeName: string;
  company: string;
  position: string;
  orders: number;
  attendanceStatus?: "PRESENT" | "LATE" | "NO_SHOW" | null;
  checkInAt?: string | null;
  day: number;
  month: number; // 0-indexed
  year: number;
}

/**
 * Daily feed parser. Americana HQ emails a daily XLSX with one row per
 * (driver × store) for a single calendar day. Columns observed in the sample
 * feed: Chain, Emp ID, Driver, Store, Company, Position, Date (YYYY-MM-DD
 * or D-MMM), Orders, Attendance, Check-in. The parser is tolerant of missing
 * columns — attendance / check-in fall back to null.
 *
 * If the sheet looks like a monthly snapshot (multiple day columns like
 * "1-Feb", "2-Feb", …), we fall back to the monthly parser and project one
 * row per day with orders — callers can decide how to slot it.
 */
export function parseAmericanaDailyXlsx(buffer: Buffer): { rows: AmericanaDailyRow[]; ingestDate: Date | null } {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  if (rawData.length < 2) return { rows: [], ingestDate: null };

  const headers: string[] = (rawData[0] || []).map((h) => (h == null ? "" : String(h).trim()));
  const lower = headers.map((h) => h.toLowerCase());

  const colOf = (...names: string[]) => {
    for (const n of names) {
      const idx = lower.indexOf(n.toLowerCase());
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const dayColumnRegex = /^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i;
  const hasMultipleDayCols = headers.filter((h) => dayColumnRegex.test(h)).length >= 2;

  if (hasMultipleDayCols) {
    // Monthly shape — fall back to the existing parser and emit a synthetic
    // "full month snapshot" row set. Caller should treat this as idempotent
    // replacement of the whole month.
    const monthly = parseAmericanaXlsx(buffer);
    const ingestDate = monthly[0]?.detectedMonth ?? null;
    const rows: AmericanaDailyRow[] = [];
    for (const row of monthly) {
      for (const [dayStr, orders] of Object.entries(row.dailyOrders)) {
        if (!orders) continue;
        const day = parseInt(dayStr, 10);
        if (!day || !ingestDate) continue;
        rows.push({
          empId: row.empId,
          driverName: row.driverName,
          chain: row.chain,
          storeName: row.storeName,
          company: row.company,
          position: row.position,
          orders: Number(orders) || 0,
          attendanceStatus: null,
          checkInAt: null,
          day,
          month: ingestDate.getMonth(),
          year: ingestDate.getFullYear(),
        });
      }
    }
    return { rows, ingestDate };
  }

  const idxChain = colOf("chain");
  const idxEmpId = colOf("emp id", "empid", "employee id");
  const idxName = colOf("driver name", "driver", "name");
  const idxStore = colOf("store name", "store");
  const idxCompany = colOf("company");
  const idxPosition = colOf("position", "vehicle", "vehicle type");
  const idxDate = colOf("date");
  const idxOrders = colOf("orders", "delivered", "order count");
  const idxAttendance = colOf("attendance", "status");
  const idxCheckIn = colOf("check-in", "check in", "checkin", "time");

  const rows: AmericanaDailyRow[] = [];
  let ingestDate: Date | null = null;

  for (let r = 1; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row || row.length === 0) continue;
    const empId = idxEmpId >= 0 ? (row[idxEmpId] != null ? String(row[idxEmpId]).trim() : "") : "";
    const driverName = idxName >= 0 ? (row[idxName] != null ? String(row[idxName]).trim() : "") : "";
    if (!empId && !driverName) continue;

    const rawDate = idxDate >= 0 ? row[idxDate] : null;
    const dateObj = parseDate(rawDate);
    if (dateObj && !ingestDate) ingestDate = dateObj;

    const day = dateObj?.getDate() ?? 0;
    const month = dateObj?.getMonth() ?? new Date().getMonth();
    const year = dateObj?.getFullYear() ?? new Date().getFullYear();

    const orders = parseNumber(idxOrders >= 0 ? row[idxOrders] : 0);
    const att = idxAttendance >= 0 ? String(row[idxAttendance] ?? "").trim().toUpperCase() : "";
    let attendanceStatus: AmericanaDailyRow["attendanceStatus"] = null;
    if (att === "PRESENT" || att === "P" || att === "ON TIME") attendanceStatus = "PRESENT";
    else if (att === "LATE") attendanceStatus = "LATE";
    else if (att === "NO SHOW" || att === "NO-SHOW" || att === "ABSENT" || att === "A") attendanceStatus = "NO_SHOW";

    rows.push({
      empId,
      driverName,
      chain: idxChain >= 0 ? String(row[idxChain] ?? "").trim() : "",
      storeName: idxStore >= 0 ? String(row[idxStore] ?? "").trim() : "",
      company: idxCompany >= 0 ? String(row[idxCompany] ?? "").trim() : "",
      position: idxPosition >= 0 ? String(row[idxPosition] ?? "").trim() : "",
      orders,
      attendanceStatus,
      checkInAt: idxCheckIn >= 0 ? String(row[idxCheckIn] ?? "").trim() || null : null,
      day,
      month,
      year,
    });
  }

  return { rows, ingestDate };
}

function parseDate(v: any): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel serial date
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + v * 86400 * 1000);
  }
  const s = String(v).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split("-").map((x) => parseInt(x, 10));
    return new Date(y, m - 1, d);
  }
  // D-MMM
  const match = s.match(/^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i);
  if (match) {
    const monthIdx = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
      .indexOf(match[2].toLowerCase());
    return new Date(new Date().getFullYear(), monthIdx, parseInt(match[1], 10));
  }
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function parseNumber(v: any): number {
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
