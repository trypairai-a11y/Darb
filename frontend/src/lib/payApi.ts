// Revision 10 (#2) — public top-up payment client. Plain fetch BY DESIGN, the
// same reason lib/trackApi.ts is: the shared axios instance's 401 interceptor
// redirects to /login, which must never happen on a public surface a merchant
// may open from a phone with no session. Same-origin /api/* calls are proxied to
// the backend by middleware.ts.

export interface PayPayload {
  /**
   * Revision 14b — one public page serves both rails. A merchant topping up its
   * wallet and a delivery company depositing the cash its drivers collected pay
   * exactly the same way, so building a second page would have meant securing
   * and rate-limiting the same surface twice.
   *
   * Optional because an older cached bundle predates it; absent reads as TOP_UP,
   * which is what every link in the wild was until now.
   */
  kind?: "TOP_UP" | "FLEET_DEPOSIT";
  reference: string;
  amountKwd: string;
  /** CONFIRMED is the deposit rail's word for PAID. */
  status: "PENDING" | "PAID" | "CONFIRMED" | "CANCELLED" | "REJECTED" | "FAILED";
  /** Who is paying: the shop, or the delivery company. */
  payerName?: string;
  vendorName: string;
  vendorCode: string | null;
  /** The gateway's hosted checkout, when a gateway issued one. Null otherwise. */
  gatewayUrl: string | null;
}

export async function fetchTopUp(token: string): Promise<PayPayload> {
  const res = await fetch(`/api/pay/${encodeURIComponent(token)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(res.status === 404 ? "NOT_FOUND" : "FAILED");
  }
  return (await res.json()) as PayPayload;
}
