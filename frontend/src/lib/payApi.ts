// Revision 10 (#2) — public top-up payment client. Plain fetch BY DESIGN, the
// same reason lib/trackApi.ts is: the shared axios instance's 401 interceptor
// redirects to /login, which must never happen on a public surface a merchant
// may open from a phone with no session. Same-origin /api/* calls are proxied to
// the backend by middleware.ts.

export interface PayPayload {
  reference: string;
  amountKwd: string;
  status: "PENDING" | "PAID" | "CANCELLED" | "FAILED";
  vendorName: string;
  vendorCode: string;
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
