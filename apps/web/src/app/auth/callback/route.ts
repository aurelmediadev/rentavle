import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/forms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Landing point for email confirmation and password-reset links (PKCE). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL("/ingresar?error=link", origin));
}
