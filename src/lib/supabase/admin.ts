import { createClient } from "@supabase/supabase-js";
import { DB_SCHEMA, publicEnv, serverEnv } from "@/lib/env";

/**
 * Cliente com service_role: ignora RLS. Uso restrito a rotas de servidor protegidas
 * (fila de e-mails, seed de demonstração). Nunca importar em componentes de cliente.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient não pode ser usado no navegador");
  }
  return createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
