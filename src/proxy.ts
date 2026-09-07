import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSessionConfig } from "@/server/auth/config";

const AUTH_PATHNAMES = new Set(["/login"]);

/**
 * Coarse-grained request-level gate. This is intentionally lightweight: it
 * performs NO database lookups and only decides where to send the browser
 * based on whether a session cookie is present.
 *
 * - Authenticated users are kept out of /login.
 * - Unauthenticated users hitting a school route are sent to /login?next=...
 * - Everything else passes through.
 *
 * The session cookie presence check is NOT authentication. Real validation
 * (DB-backed token hash lookup, expiry, tenant membership/RBAC) always runs in
 * the layout and Server Functions, which can never be bypassed by this file.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Static framework paths and metadata are never gated here.
  if (pathname === "/" || pathname.startsWith("/_next/")) {
    return NextResponse.next();
  }

  if (AUTH_PATHNAMES.has(pathname)) {
    if (request.cookies.has(getSessionConfig().cookieName)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Any other top-level segment (e.g. /<school> and nested routes) is
  // dashboard territory.
  if (!request.cookies.has(getSessionConfig().cookieName)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|pdf)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};