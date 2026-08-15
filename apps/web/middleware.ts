import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Lightweight shared-secret gate.
 * Set DASHBOARD_SECRET in the environment. Clients must present:
 *   - Cookie: dashboard_secret=<value>
 *   - or Header: x-dashboard-secret: <value>
 * If DASHBOARD_SECRET is unset, the gate is disabled (local dev only).
 */
export function middleware(request: NextRequest) {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) {
    return NextResponse.next();
  }

  const fromHeader = request.headers.get("x-dashboard-secret");
  const fromCookie = request.cookies.get("dashboard_secret")?.value;

  if (fromHeader === secret || fromCookie === secret) {
    return NextResponse.next();
  }

  // Allow a one-shot query param to set the cookie (handy for phone bookmark)
  const q = request.nextUrl.searchParams.get("key");
  if (q === secret) {
    const res = NextResponse.redirect(new URL(request.nextUrl.pathname, request.url));
    res.cookies.set("dashboard_secret", secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  return new NextResponse("Unauthorized — set DASHBOARD_SECRET cookie or x-dashboard-secret header", {
    status: 401,
    headers: { "Content-Type": "text/plain" },
  });
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and Next internals.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
