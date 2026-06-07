const SLA_HOURS: Record<string, number> = {
  URGENT: 4,
  HIGH: 12,
  MEDIUM: 48,
  LOW: 168,
};

export function ticketSlaDeadline(priority: string | undefined | null): Date {
  const hours = SLA_HOURS[priority || "MEDIUM"] ?? SLA_HOURS.MEDIUM;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}
