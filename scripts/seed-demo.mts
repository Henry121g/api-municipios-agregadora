// Cria o usuário técnico da demonstração e uma chave com limite de 30/min.
// Imprime a chave UMA vez: copie para a variável de ambiente DEMO_API_KEY (Vercel/.env.local).
// Uso: pnpm seed:demo
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !service || !anon) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const admin = createClient(url, service, { db: { schema: "api" }, auth: { persistSession: false } });
const EMAIL = "demo@api.demo.test";
const password = randomUUID() + randomUUID(); // conta técnica: senha descartável, nunca publicada

const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const old = list.users.find((u) => u.email === EMAIL);
if (old) await admin.auth.admin.deleteUser(old.id); // cascata revoga as chaves antigas
const { error } = await admin.auth.admin.createUser({
  email: EMAIL,
  password,
  email_confirm: true,
  user_metadata: { app: "api", full_name: "Demonstração" },
});
if (error) throw error;

const user = createClient(url, anon, { db: { schema: "api" }, auth: { persistSession: false } });
await user.auth.signInWithPassword({ email: EMAIL, password });
const { data, error: keyError } = await user.rpc("create_key", { p_name: "Página de demonstração" });
if (keyError) throw keyError;
const { id, key } = (data as { id: string; key: string }[])[0];
await admin.from("keys").update({ rate_limit_per_minute: 30 }).eq("id", id);

console.log("✓ Chave de demonstração criada (30 req/min). Configure no ambiente do app:");
console.log(`DEMO_API_KEY=${key}`);
