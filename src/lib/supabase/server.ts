import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { DB_SCHEMA, publicEnv } from "@/lib/env";

/** Cliente do Supabase para Server Components, Server Actions e Route Handlers (RLS do usuário). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    db: { schema: DB_SCHEMA },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components não podem gravar cookies; o proxy renova a sessão nesses casos.
        }
      },
    },
  });
}
