import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const root = join(__dirname, "..", "..");
const migrationsDir = join(root, "supabase", "migrations");

export type Role = "anon" | "authenticated" | "service_role";

export interface TestDb {
  db: PGlite;
  /** Executa `fn` como usuário da API (RLS ativa). `topic` simula a autorização de um canal Realtime. */
  as<T>(uid: string | null, fn: (tx: Transaction) => Promise<T>, opts?: { role?: Role; topic?: string }): Promise<T>;
  signUp(fullName: string, email?: string, app?: string): Promise<string>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = await PGlite.create();
  await db.exec(readFileSync(join(__dirname, "supabase-stub.sql"), "utf8"));
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }

  const as: TestDb["as"] = (uid, fn, opts = {}) =>
    db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
      await tx.query(`select set_config('realtime.topic', $1, true)`, [opts.topic ?? ""]);
      await tx.exec(`set local role ${opts.role ?? (uid ? "authenticated" : "anon")}`);
      return fn(tx);
    });

  let counter = 0;
  const signUp: TestDb["signUp"] = async (fullName, email, app = "api") => {
    counter += 1;
    const { rows } = await db.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('app', $3::text, 'full_name', $2::text)) returning id`,
      [email ?? `usuario${counter}@exemplo.test`, fullName, app],
    );
    return rows[0].id;
  };

  return { db, as, signUp };
}
