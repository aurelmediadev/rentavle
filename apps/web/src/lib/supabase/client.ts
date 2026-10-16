"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client, only for uploads to signed URLs (the URL carries the permission). */
export function createSupabaseBrowserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
