import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { env } from "@/lib/env";

/** Supabase client bound to the current request's auth cookies. */
export async function createSupabaseServerClient() {
  // Auth checks token expiry with Date.now(); with Cache Components that must
  // run at request time, never during a prerender.
  await connection();
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the
          // session on every request, so this is safe to ignore here.
        }
      },
    },
  });
}
