import { NextRequest, NextResponse } from "next/server";

// Basic-Auth gate for the deployed app. The password lives in the
// SITE_PASSWORD env var (set on Vercel); without it (local dev) the
// middleware lets everything through.

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"]
};

export function middleware(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) {
    return NextResponse.next();
  }

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const suppliedPassword = decoded.split(":").slice(1).join(":");
      if (suppliedPassword === password) {
        return NextResponse.next();
      }
    } catch {
      // fall through to 401
    }
  }

  return new NextResponse("Zugang nur mit Passwort.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Acquisition Desk", charset="UTF-8"' }
  });
}
