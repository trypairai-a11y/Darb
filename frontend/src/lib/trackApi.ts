// Darb 2.0 PRD §12 — public tracking API client. Plain fetch BY DESIGN: the
// shared axios instance's 401 interceptor redirects to /login, which must
// never happen on the public customer surface. Same-origin /api/* calls are
// proxied to the backend by middleware.ts.

export interface TrackPayload {
  orderNumber: string;
  status:
    | "CREATED"
    | "REJECTED"
    | "DISPATCHING"
    | "NO_DRIVER"
    | "ASSIGNED"
    | "PICKED_UP"
    | "DELIVERED"
    | "FAILED"
    | "CANCELLED"
    | "RETURNED";
  vendor: { name: string; nameAr: string | null };
  driver: { firstName: string; phone: string | null } | null;
  driverPosition: { lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
  etaMin: number | null;
  scheduledAt: string | null;
  slaDeadline: string | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  tipKwd: string | null;
  rated: boolean;
  canCancel: boolean;
}

export class TrackApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "TrackApiError";
  }
}

async function trackFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new TrackApiError(
      typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Request failed (${res.status})`,
      res.status,
    );
  }
  return body as T;
}

export function getTrack(token: string): Promise<TrackPayload> {
  return trackFetch<TrackPayload>(`/api/track/${encodeURIComponent(token)}`);
}

export function postRating(
  token: string,
  input: { stars: number; comment?: string },
): Promise<{ ok: true; stars: number }> {
  return trackFetch(`/api/track/${encodeURIComponent(token)}/rating`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function postTip(
  token: string,
  input: { amountKwd: number },
): Promise<{ ok: true; tipKwd: string }> {
  return trackFetch(`/api/track/${encodeURIComponent(token)}/tip`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function postCancelRequest(
  token: string,
  input: { reason?: string },
): Promise<{ ok: true; message: string }> {
  return trackFetch(`/api/track/${encodeURIComponent(token)}/cancel`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
