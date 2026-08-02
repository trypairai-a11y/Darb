import { nextTicketNumber } from "../../utils/ticketNumber";
import { getMockPrisma, resetAllMocks } from "../setup";

/**
 * The ticket sequence had the bug orderService already documents twice: the
 * maximum was taken with a text ORDER BY and the suffix parsed in JS. The demo
 * tenant carries "TKT-2026034" and "DEMO-202605-114" rows from earlier imports,
 * "TKT-" sorts above "TK-0009", `"TKT-2026034".replace("TK-", "")` does not
 * match, parseInt returned NaN and every ticket after it was numbered
 * "TK-0NaN". ticketNumber is @unique, so the second one could not be written at
 * all: driver shift requests failed on the constraint even once the enum
 * accepted the category.
 */
describe("nextTicketNumber", () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    resetAllMocks();
    // resetAllMocks walks the model objects; $queryRaw hangs off the client
    // itself, so its calls survive unless cleared here.
    prisma.$queryRaw.mockClear();
    prisma.$queryRaw.mockResolvedValue([]);
  });

  it("starts at TK-0001 when the tenant has no TK-numbered ticket", async () => {
    prisma.$queryRaw.mockResolvedValue([{ highest: null }]);
    await expect(nextTicketNumber("t1")).resolves.toBe("TK-0001");
  });

  it("starts at TK-0001 when the aggregate returns no row at all", async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(nextTicketNumber("t1")).resolves.toBe("TK-0001");
  });

  it("takes the numeric maximum and increments it", async () => {
    prisma.$queryRaw.mockResolvedValue([{ highest: 10 }]);
    await expect(nextTicketNumber("t1")).resolves.toBe("TK-0011");
  });

  it("coerces a driver that returns the aggregate as a string", async () => {
    prisma.$queryRaw.mockResolvedValue([{ highest: "34" }]);
    await expect(nextTicketNumber("t1")).resolves.toBe("TK-0035");
  });

  it("never emits NaN, whatever the aggregate hands back", async () => {
    prisma.$queryRaw.mockResolvedValue([{ highest: "TKT-2026034" }]);
    await expect(nextTicketNumber("t1")).resolves.toBe("TK-0001");
  });

  it("grows past the padding width instead of wrapping", async () => {
    prisma.$queryRaw.mockResolvedValue([{ highest: 9999 }]);
    await expect(nextTicketNumber("t1")).resolves.toBe("TK-10000");
  });

  it("scopes to the tenant and excludes non TK-<digits> numbers in SQL", async () => {
    prisma.$queryRaw.mockResolvedValue([{ highest: 4 }]);
    await nextTicketNumber("tenant-9");

    const [strings, ...values] = prisma.$queryRaw.mock.calls[0];
    const sql = (strings as string[]).join("?");
    expect(sql).toContain('"tenantId"');
    // The regex guard is what keeps "TKT-2026034" and "DEMO-202605-114" out of
    // the CAST; without it the aggregate errors instead of skipping them.
    expect(sql).toContain("^TK-[0-9]+$");
    expect(values).toContain("tenant-9");
  });
});
