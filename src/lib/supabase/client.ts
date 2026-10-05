"use client";

import { createBrowserClient } from "@supabase/ssr";
import { DB_SCHEMA, publicEnv } from "@/lib/env";

export function createClient() {
  return createBrowserClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    db: { schema: DB_SCHEMA },
  });
}
