import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// /api/cron authenticates with CRON_SECRET instead of a session.
const PUBLIC_PREFIXES = ["/ingresar", "/registro", "/recuperar", "/auth", "/invitacion", "/api/cron"];

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
