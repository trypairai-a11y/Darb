import { NextRequest, NextResponse } from "next/server";

// Persona handles (PRD §5 surfaces): each free-tier domain lands its audience
// on the right surface. Only the ROOT path redirects — deep links, assets and
// the API proxy are untouched, so one app serves every handle.
const HANDLE_LANDING: Record<string, string> = {
  "darb-hq.vercel.app": "/cockpit",
  "darb-ops.vercel.app": "/ops",
  "darb-merchant.vercel.app": "/vendor",
  "darb-fleet.vercel.app": "/fleet-portal",
};

export function middleware(request: NextRequest) {
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api")) {
    const apiUrl = process.env.API_PROXY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    return NextResponse.rewrite(new URL(`${apiUrl}${url.pathname}${url.search}`));
  }

  if (url.pathname === "/") {
    const landing = HANDLE_LANDING[request.headers.get("host") ?? ""];
    if (landing) return NextResponse.redirect(new URL(landing, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/"],
};
