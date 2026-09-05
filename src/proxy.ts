import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Optimistic gate only — every page/server action re-checks the session and
// permissions itself (src/lib/permissions.ts). This just keeps signed-out
// visitors from seeing app pages at all.
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackURL", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except auth/api routes, OAuth discovery (/.well-known, read
    // by MCP clients with no cookie), static assets, and the sign-in page.
    "/((?!api|_next/static|_next/image|sign-in|\\.well-known|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
