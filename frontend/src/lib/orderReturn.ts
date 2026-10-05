// Client note (2026-10-05, answering 2026-09-21): "the driver must return the
// order to the vendor, after that he can report that the delivery failed".
// A courier who cannot deliver now turns back first. The order keeps its
// in-flight status (ASSIGNED, ARRIVED or PICKED_UP) until they are at the
// shop, where the failure is reported and it goes FAILED then RETURNED in one
// step. While it is on its way back the server stamps
// `metadata.returnStartedAt`, and this is what every screen reads to say so.
const RETURNABLE = ["ASSIGNED", "ARRIVED", "PICKED_UP"];

export function isReturningToStore(
  order: { status: string; metadata?: Record<string, unknown> | null } | null | undefined,
): boolean {
  if (!order || !RETURNABLE.includes(order.status)) return false;
  const at = order.metadata?.returnStartedAt;
  return typeof at === "string" && at.length > 0;
}
