import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Instead of a session: /api/cron uses CRON_SECRET, /api/webhooks a signature, /d/ (shared documents) its token.
const PUBLIC_PREFIXES = ["/ingresar", "/registro", "/recuperar", "/auth", "/invitacion", "/api/cron", "/api/webhooks", "/d/", "/precios", "/terminos", "/privacidad", "/sitemap.xml", "/robots.txt"];

function isPublic(pathname: string) {
  return pathname === "/" || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { response, isSignedIn } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  // Optimistic redirect; real authorization happens next to the data.
  if (!isSignedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/ingresar";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
