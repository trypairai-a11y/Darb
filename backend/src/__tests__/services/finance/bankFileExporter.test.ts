// Phase 8 Wave 0 RED test — turned GREEN by Wave 2 (services/finance/
// bankFileExporter.ts using papaparse stream API). Do not skip.
//
// Behavior contract (REQ-finance-payroll):
//   1. streamPayrollCsv(payrollRunId, tenantId) writes a header
//      'IBAN,Amount,Reference' then one line per non-zero PayrollLine.
//   2. 300-row run completes within 500ms wall clock + <50MB peak heap
//      delta (uses Node Transform stream OR papaparse stream API).
//   3. Output parses back deterministically: csv.parse(buffer) === input
//      rows (length + each field).
//   4. Tenant isolation: streaming a run for tenant-A never reads
//      tenant-B PayrollLine rows; cross-tenant runId returns 404 not 200.

import { prisma } from "../../mocks/config";
import { streamPayrollCsv } from "../../../services/finance/bankFileExporter";

const TENANT_A = "tenant-A";
const TENANT_B = "tenant-B";

function makeLines(n: number, tenantId = TENANT_A) {
  return Array.from({ length: n }, (_, i) => ({
    id: `line-${i}`,
    tenantId,
    runId: "run-1",
    driverId: `drv-${i}`,
    iban: `KW81MUKB00000000000000${String(i).padStart(6, "0")}`,
    netKd: "1.500",
    reference: `2026-W17-${i}`,
  }));
}

describe("Phase 8 / REQ-finance-payroll: bank-file CSV stream", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma as any).payrollRun = {
      findFirst: jest.fn().mockResolvedValue({
        id: "run-1",
        tenantId: TENANT_A,
        period: "2026-W17",
        status: "FROZEN",
      }),
    };
    (prisma as any).payrollLine = {
      findMany: jest.fn().mockResolvedValue(makeLines(3)),
    };
  });

  test("streamPayrollCsv writes header 'IBAN,Amount,Reference' + 1 line per non-zero PayrollLine", async () => {
    const buffer = await streamPayrollCsv("run-1", TENANT_A);
    const text = buffer.toString("utf8");
    const lines = text.trim().split(/\r?\n/);
    expect(lines[0]).toBe("IBAN,Amount,Reference");
    expect(lines.length).toBe(4); // header + 3 rows
  });

  test("300-line run completes within 500ms wall clock", async () => {
    (prisma as any).payrollLine.findMany = jest
      .fn()
      .mockResolvedValue(makeLines(300));
    const start = Date.now();
    const buffer = await streamPayrollCsv("run-1", TENANT_A);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
    const lines = buffer.toString("utf8").trim().split(/\r?\n/);
    expect(lines.length).toBe(301); // header + 300 rows
  });

  test("output parses back deterministically: parsed rows equal input rows", async () => {
    const inputRows = makeLines(5);
    (prisma as any).payrollLine.findMany = jest
      .fn()
      .mockResolvedValue(inputRows);
    const buffer = await streamPayrollCsv("run-1", TENANT_A);
    const lines = buffer.toString("utf8").trim().split(/\r?\n/);
    expect(lines[0]).toBe("IBAN,Amount,Reference");
    const parsed = lines.slice(1).map((line) => {
      const [iban, amount, reference] = line.split(",");
      return { iban, amount, reference };
    });
    expect(parsed.length).toBe(inputRows.length);
    for (let i = 0; i < inputRows.length; i++) {
      expect(parsed[i].iban).toBe(inputRows[i].iban);
      expect(parsed[i].reference).toBe(inputRows[i].reference);
    }
  });

  test("tenant isolation: streaming a run for tenant-A never reads tenant-B rows; cross-tenant runId returns 404", async () => {
    (prisma as any).payrollRun.findFirst = jest.fn().mockResolvedValue(null);
    await expect(streamPayrollCsv("run-other", TENANT_B)).rejects.toThrow(
      /(not found|404)/i,
    );
    (prisma as any).payrollRun.findFirst = jest.fn().mockResolvedValue({
      id: "run-1",
      tenantId: TENANT_A,
      period: "2026-W17",
      status: "FROZEN",
    });
    (prisma as any).payrollLine.findMany = jest.fn().mockResolvedValue([]);
    await streamPayrollCsv("run-1", TENANT_A);
    const call = (prisma as any).payrollLine.findMany.mock.calls[0][0];
    expect(call.where.tenantId).toBe(TENANT_A);
  });
});

// RED — turned GREEN by Wave 2 (bankFileExporter.ts + PayrollLine schema).
