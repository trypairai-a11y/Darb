import { prisma } from "../config";

/**
 * Next per-tenant ticket number "TK-{seq}".
 *
 * The maximum is taken NUMERICALLY, in the database, for the reason
 * orderService.nextOrderNumber spells out at length: a text column does not
 * sort like a number, and reasoning about it as though it does wedges the
 * sequence permanently rather than cosmetically.
 *
 * Here it had already happened. The demo tenant carries "TKT-2026034" and
 * "DEMO-202605-114" numbers from earlier imports. "TKT-" outranks every
 * "TK-0009" in a text ORDER BY, `"TKT-2026034".replace("TK-", "")` matches
 * nothing (the string holds "TKT-", not "TK-"), parseInt gave NaN, and
 * padStart turned that into "TK-0NaN". ticketNumber is @unique, so the first
 * such ticket was written and every ticket after it — every driver shift
 * request, every support ticket — failed on the constraint. Fixing the
 * TicketCategory enum alone would not have made them work.
 *
 * The regex guard is what lets the CAST skip those rows instead of erroring on
 * them, and the ::integer cast on the offset is load-bearing: Prisma binds a JS
 * number as int8 and Postgres has no substring(text, bigint).
 */
export async function nextTicketNumber(tenantId: string): Promise<string> {
  const PREFIX = "TK-";
  const WIDTH = 4;
  const offset = PREFIX.length + 1;

  const rows = await prisma.$queryRaw<Array<{ highest: number | null }>>`
    SELECT MAX(CAST(SUBSTRING("ticketNumber" FROM ${offset}::integer) AS INTEGER)) AS highest
    FROM "Ticket"
    WHERE "tenantId" = ${tenantId}
      AND "ticketNumber" ~ '^TK-[0-9]+$'
  `;
  const highest = Number(rows[0]?.highest ?? 0) || 0;
  return `${PREFIX}${String(highest + 1).padStart(WIDTH, "0")}`;
}
