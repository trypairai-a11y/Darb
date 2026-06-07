import { prisma } from "../config";

export async function nextTicketNumber(tenantId: string): Promise<string> {
  const lastTicket = await prisma.ticket.findFirst({
    where: { tenantId },
    orderBy: { ticketNumber: "desc" },
  });
  const nextNum = lastTicket
    ? parseInt(lastTicket.ticketNumber.replace("TK-", "")) + 1
    : 1;
  return `TK-${String(nextNum).padStart(4, "0")}`;
}
